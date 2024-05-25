"use strict"

class ListNode {
	constructor(parent){
		this.value = 0;
		this.tree = null;
		this.child = null;
		this.parent = parent;
	}
}

class Pointer {
	constructor(x, y) {
		this.dragX=x;
		this.dragY=y;
		this.X=x;
		this.Y=y;
	}
	get deltaX() { return this.dragX - this.X; }
	get deltaY() { return this.dragY - this.Y; }
}

var countRenders=0;

var
	//index of currently active clipbaord
	activeClipboard=1,
	//canvas element
	canvas=document.getElementById("ourCanvas"),
	//whether the code should capture the onScroll event for zooming in and out
	captureScroll=false,
	//width of each cell
	cellWidth=20,
	//canvas context
	ctx=canvas.getContext("2d"),
	//this determines if the UI is using the dark theme.
	darkMode=1,
	//canvas fill color(0-dark,1-light)
	detailedCanvas=true,
	//ID of the thing being dragged(0=nothing,-4 to -1 and 4 to 4 for each corner)
	edgeBeingDragged=0,
	//whether the cursor draws a specific state or changes automatically;-1=auto, other #s =state
	state=-1,
	//state currently being drawn by the cursor, -1=none
	drawnState=-1,
	//this determines whether the simulation is in draw, move, or select mode
	editMode=0,
	//changes the amount of movement based on frame rate
	frameMultiplier=1,
	//time elapsed
	genCount=0,
	//state of the grid
	GRID={
		//which kind of grid is being used
		type:0,//0=infinite,1=finite,2=toroidal
		//data for the cells on an infinte grid
		head:null,
		//data for the cells on a finite grid
		finiteArray:[],
		//area representing a finite portion of the grid
		finiteArea:{margin:0,top:0,right:0,bottom:0,left:0,newTop:0,newRight:0,newBottom:0,newLeft:0},
		//state of the background(used for B0 rules)
		backgroundState:0
	},
	//finite population
	gridPopulation=0,
	//used for rendering user caused changes
	runMainLoop=false,
	//whether or not the sim is playing
	isPlaying=0,
	//array of key states
	key=[],
	//these are the 6 markers which can be placed on the grid
	markers=Array(6).fill().map(() => ({activeState:0,top:0,right:0,bottom:0,left:0,pattern:[],shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0}})),
	//list of mouse,pointers, touch instances, and other styluses
	pointers=[],
	//area containing the pattern to be pasted
	pasteArea={isActive:false,top:0,left:0,pointerRelativeX:0,pointerRelativeY:0},
	//point where the simulator resets to
	resetEvent=null,
	//rule stored internally as an n-tree for a n state rule
	rule,
	//rulestring
	rulestring="B3/S23",
	//number of nodes in the rule, rule family(INT, Generations, History), color
	ruleMetadata={size:0,family:"INT",color:[]},
	//selected area
	selectArea={isActive:false,top:0,right:0,bottom:0,left:0},
	//index of the marker being selected and interacted with
	selectedMarker=-1,
	//keeps track of when the last simulation update occurred
	timeOfLastUpdate=0,
	//keeps track of when the last generation occurred
	timeOfLastGeneration=0,
	//position of the current view(x/y position,zoom)
	view={
		x:-30,y:-20,z:1,
		//position of the view for when a pointer clicks or touches
		touchX:0,touchY:0,touchZ:1,
	},
	//set to true if the sim was reset in/before the current generation
	wasReset=false,
	//window and canvas dimensions
	windowHeight=0,windowWidth=0,canvasWidth=0,canvasHeight=0;

const worker = new Worker("worker.js");

worker.onmessage = (e) => {
	switch(e.data.type){
		case "startWrite":
			drawnState = e.data.args[0];
			break;
		case "render":
			//writeCell(...e.data.args);
			renderPattern(e.data.args[0]);
			document.getElementById("population").innerHTML="Population "+e.data.args[1];
			document.getElementById("gens").innerHTML="Generation "+e.data.args[2];
			break;
	}
}
let socket;
try{
	socket=io();
}catch(error){
	socket=null;
}

var clientId, clientList={};

//set the rule to Conway's Game of Life
// let currentEvent=new EventNode(null,"start");
//scelaes the canvas to fit the window
scaleCanvas();
//sets the available buttons in the Other Actions menu
setActionMenu();
//moves all dropdown menu to be above or below the parent button to best fit in the window
updateDropdownMenu();
//initializes the menu of draw states
setDrawMenu();
//set the rule and step size if cached by the browser
save();

if(location.search!=="")importSettings();

function main(){
	//resized the canvas whenever the window changes size
	if(
		windowWidth!==(window.innerWidth || document.documentElement.clientWidth)||
		windowHeight<(window.innerHeight || document.documentElement.clientHeight)||
		windowHeight>(window.innerHeight || document.documentElement.clientHeight)+40){
		scaleCanvas();
	}
	//adjust a movement multplier based on the current framerate
	if(timeOfLastUpdate===0){
		frameMultiplier=1;
	}else{
		//use a weighted sum which changes frameMultiplier by 1/10th the difference
		frameMultiplier=0.1*(9*frameMultiplier+(Date.now()-timeOfLastUpdate)*0.04);
	}
	timeOfLastUpdate=Date.now();
	
	//register key inputs
	keyInput();
	//register mouse and touch inputs
	if(pointers.length>0)update();
	//run a generation of the simulation
	if(isPlaying<0||(isPlaying>0&&Date.now()-timeOfLastGeneration>1000-10*parseInt(document.getElementById("speed").value))){
		timeOfLastGeneration=Date.now();
		if(resetEvent===null){
			//creates an EventNode with all neccessary information representing gen 0, and saves a referece to it
			// resetEvent=new EventNode(currentEvent.parent, "reset point");
			// if("paste" in currentEvent)resetEvent.paste=currentEvent.paste;
			// if("draw" in currentEvent)resetEvent.draw=currentEvent.draw;
			// currentEvent=resetEvent;
			//resetEvent.child=currentEvent.child;
			if(GRID.type!==0&&typeof(resetEvent.finiteArray)==="string")resetEvent.finiteArray=parseRLE(resetEvent.finiteArray).pattern;
		}
		// for(let i=0;i<stepSize;i++){
		// 	gen(GRID);
		// 	worker.postMessage({type:"next",args:[]});
		// 	currentEvent=new EventNode(currentEvent, "gen");
		// 	if(isPlaying<0)isPlaying++;
		// }

		// if(GRID.type===0){
		// 	document.getElementById("population").innerHTML="Population "+(GRID.backgroundState===0?GRID.head.population:GRID.head.distance*GRID.head.distance-GRID.head.population);
		// }else{
		// 	document.getElementById("population").innerHTML="Population "+gridPopulation;
		// }
		// document.getElementById("gens").innerHTML="Generation "+genCount;

		wasReset=false;
		for(let i=0;i<document.getElementById("searchOptions").children.length-1;i++){
			searchAction(document.getElementById("searchOptions").children[i]);
		}
	}
	//draw the simulation
	//render();
	//call the next frame if if the simulation is playing or a key is pressed
	if(isPlaying!==0||runMainLoop)requestAnimationFrame(main);
}
requestAnimationFrame(main);

function mod(num1,num2){
	return (num1%num2+num2)%num2;
}

function distance(num1, num2){
	return Math.sqrt(num1*num1+num2*num2);
}

function importSettings(){
	let params= window.location.search.split("&");

	for(let i=0;i<params.length;i++){
		params[i]=params[i].split("=");
	}
	console.log(params);

	for (const [key, value] of params){
		let area, attributes;
		switch(key){
		case "gen":
			genCount=parseInt(value);
			document.getElementById("gens").innerHTML="Generation "+genCount;
			break;
		case "background":
			GRID.backgroundState=parseInt(value);
			break;
		case "step":
			stepSize=parseInt(value);
			document.getElementById("step").value=stepSize;
			break;
		case "resetStop":
			if(value==="false"){
				document.getElementById("resetStop").checked=false;
			}
			break;
		case "ratio":
			document.getElementById("density").value=parseInt(value);
			document.getElementById("percent").innerHTML = `${value}%`;
			break;
		case "slot":
			activeClipboard=parseInt(value);
			for(let i=0;i<document.getElementById("copyMenu").children.length;i++){
				if(document.getElementById("copyMenu").children[i].innerHTML.includes(value.toString())){
					replaceDropdownElement(document.getElementById("copyMenu").children[i]);
				}
			}
			break;
		case "slots":
			attributes=value.split(".");
			for(let i=0;i*4<attributes.length;i++){
				clipboard[i+1].pattern=baseNToPattern(parseInt(attributes[i*4]),parseInt(attributes[i*4+1]),LZ77ToBaseN(attributes[i*4+2]));
				if(clipboard[i+1].pattern&&clipboard[i+1].pattern[0])clipboard[i+1].previewBitmap=patternToBitmap(clipboard[i+1].pattern);
				if(attributes[i*4+3]!==""){
					const shipInfo=attributes[i*4+3].split(",");
					clipboard[i+1].shipInfo={dx:parseInt(shipInfo[2]),dy:parseInt(shipInfo[3]),shipOffset:{x:parseInt(shipInfo[4]),y:parseInt(shipInfo[5])},phases:Array(shipInfo.length-6),period:shipInfo.length-6};
					for(let j=6;j<shipInfo.length;j++){
						clipboard[i+1].shipInfo.phases[j-6]=baseNToPattern(parseInt(shipInfo[0]),parseInt(shipInfo[1]),LZ77ToBaseN(shipInfo[j]));
					}
				}
				if(i>0){
					document.getElementById("copyMenu").innerHTML+=`<button onclick="changeCopySlot(this);" onmouseenter="showPreview(this);">${i+2}<canvas class="patternPreview"></canvas></button>`;
					clipboard.push({pattern:[],shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0},previewBitmap:null});
				}
			}
			break;
		case "selA":
			selectArea.isActive=true;
			setActionMenu();
			area=value.split(".").map(str => parseInt(str));

			selectArea.top=area[0];
			selectArea.right=area[1];
			selectArea.bottom=area[2];
			selectArea.left=area[3];
			break;
		case "pasteA":
			pasteArea.isActive=true;
			setActionMenu();
			area=value.split(".").map(str => parseInt(str));

			pasteArea.top=area[0];
			pasteArea.left=area[1];
			break;
		case "pat":
			area=[0,0,0,0];
			for(let i=0;i<4;i++)area[i]=parseInt(value.split(".")[i]);
			if(value.split(".").length===5){
				let pattern=baseNToPattern(area[1]-area[3],area[2]-area[0],LZ77ToBaseN(value.split(".")[4]));
				GRID.head=widenTree({top:area[0],right:area[1],bottom:area[2],left:area[3]});
				GRID.head=writePatternToGrid(area[3],area[0],pattern,GRID.head);
				document.getElementById("population").innerHTML="Population "+(GRID.backgroundState===0?GRID.head.population:GRID.head.distance*GRID.head.distance-GRID.head.population);
			}else{
				GRID.type=parseInt(value.split(".")[4]);
				GRID.finiteArea={margin:GRID.type===1?1:0,top:area[0],right:area[1],bottom:area[2],left:area[3],newTop:area[0],newRight:area[1],newBottom:area[2],newLeft:area[3]},
				//add appropriate margin to pattern
				GRID.finiteArray=baseNToPattern(area[1]-area[3]+2*GRID.finiteArea.margin,area[2]-area[0]+2*GRID.finiteArea.margin,LZ77ToBaseN(value.split(".")[5]));
				document.getElementById("population").innerHTML="Population "+gridPopulation;
			}
			fitView();
			break;
		case "rule":
			document.getElementById("rule").value=decodeURIComponent(value);
			setRule(decodeURIComponent(value));
			break;
		case "marker":
			attributes=value.split(".").map(str => (isNaN(str)||str==="")?str:parseInt(str));
			for(let i=0;i<attributes.length;i+=7){
				markers[attributes[i]]={activeState:1,top:attributes[i+1],right:attributes[i+2],bottom:attributes[i+3],left:attributes[i+4],shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0},pattern:[]};
				if(attributes[i+5]!=="")markers[attributes[i]].pattern=baseNToPattern(attributes[i+2]-attributes[i+4],attributes[i+3]-attributes[i+1],LZ77ToBaseN(attributes[i+5]));
				if(attributes[i+6]&&attributes[i+6]!==""){
					const shipInfo=attributes[i+6].split(",");
					markers[attributes[i]].shipInfo={dx:parseInt(shipInfo[2]),dy:parseInt(shipInfo[3]),shipOffset:{x:parseInt(shipInfo[4]),y:parseInt(shipInfo[5])},phases:Array(shipInfo.length-6),period:shipInfo.length-6};
					for(let j=6;j<shipInfo.length;j++){
						markers[attributes[i]].shipInfo.phases[j-6]=baseNToPattern(parseInt(shipInfo[0]),parseInt(shipInfo[1]),LZ77ToBaseN(shipInfo[j]));
					}
				}
			}
			break;

		case "rleMargin":
			document.getElementById("rleMargin").value=value;
			break;
		case "userReset":
			document.getElementById("userReset").checked=true;
			break;

		//import search options
		case "search":
			//iterate trough each option to be imported
			attributes=value.split(".");
			for(let i = 0; i < attributes.length; i++){
				const fields=attributes[i].split(",");
				let currentFieldElement=document.getElementById("searchOptions").lastElementChild;
				let shipInfo=null;
				//if the a ship is stored in the "Generate Salvo" portion if the URL
				//use it to initialize the .info property of the "Expression" element
				//then splice it out of the URI substring
				changeAction(findElementContaining(currentFieldElement.children[1].children[1],decodeURIComponent(fields[0])));
				//iterate through each setting within the option
				for(let j=1;j<fields.length;j++){
					if(!currentFieldElement.children[j+1]||fields[j]==="")continue;
					if(currentFieldElement.children[j+1].tagName==="INPUT"){
						currentFieldElement.children[j+1].setAttribute("value",decodeURIComponent(fields[j]));
						if(decodeURIComponent(fields[0])==="Generate Salvo"){
							switch(j){
							case 1:
								currentFieldElement.info.repeatTime=parseInt(fields[j]);
								break;
							case 3:
								for(let k=0;k<parseInt(fields[j]);k++){
									incrementSearch(currentFieldElement.info);
								}
								break;
							}
						}
					}else if(currentFieldElement.children[j+1].className.includes("condition")){
						changeCondition(findElementContaining(currentFieldElement.children[j+1],decodeURIComponent(fields[j])));
					}else if(currentFieldElement.children[j+1].className.includes("conjunction")){
						//this shouldn't need an if statment but breaks URI parsing otherwise
						if(decodeURIComponent(fields[j])==="Not When")replaceDropdownElement(findElementContaining(currentFieldElement.children[j+1],decodeURIComponent(fields[j])));
					}else if(currentFieldElement.children[j+1].className.includes("dropdown")){
						replaceDropdownElement(findElementContaining(currentFieldElement.children[j+1],decodeURIComponent(fields[j])));
					}
				}
			}
		}
	}
	currentEvent=new EventNode(null,"import URL");
	// // TODO: replace render() here
}

function findElementContaining(element,str){
	if(element.innerHTML===str){
		return element;
	}else{
		for (let i = 0; i < element.children.length; i++) {
			let result=findElementContaining(element.children[i],str);
			if(result!==null)return result;
		}
		return null;
	}
}

function exportSetting(){
	let text=`${window.location.protocol}//${window.location.host}
		${window.location.pathname}?v=0.4.4`;

	if(resetEvent!==null)setEvent(resetEvent);
	if(state!==-1){
		text+="&draw="+state;
	}

	if(genCount!==0)text+="&gen="+genCount;

	if(GRID.backgroundState!==0)text+="&background="+GRID.backgroundState;

	if(stepSize!==1)text+="&step="+stepSize;

	if(activeClipboard!==1)text+="&slot="+activeClipboard;

	if(clipboard.length>3||clipboard[1]){
		text+="&slots=";
		for(let i=1;i<clipboard.length-1;i++){
			if(i>1)text+=".";
			if(clipboard[i]&&clipboard[i].pattern.length>0){
				text+=`${clipboard[i].pattern.length}.${clipboard[i].pattern[0].length}.${baseNToLZ77(patternToBaseN(clipboard[i].pattern))}.`;
				if(clipboard[i].shipInfo.dx!==null){
					text+=`${clipboard[i].shipInfo.phases[0].length},${clipboard[i].shipInfo.phases[0][0].length},${clipboard[i].shipInfo.dx},${clipboard[i].shipInfo.dy},${clipboard[i].shipInfo.shipOffset.x},${clipboard[i].shipInfo.shipOffset.y}`;
					for(let j=0;j<clipboard[i].shipInfo.phases.length;j++){
						text+=","+baseNToLZ77(patternToBaseN(clipboard[i].shipInfo.phases[j]));
					}
				}
			}else{
				text+="0.0..";
			}
		}
	}

	if(selectArea.isActive)text+=`&selA=${selectArea.top}.${selectArea.right}.${selectArea.bottom}.${selectArea.left}`;

	if(pasteArea.isActive)text+=`&pasteA=${pasteArea.top}.${pasteArea.left}`;
	
	if(isElementCheckedById("resetStop")===false)text+="&resetStop=false";

	if(rulestring!=="B3/S23"){
		text+="&rule="+encodeURIComponent(rulestring);
	}
	
	let area, patternCode;
	if(GRID.type===0){
		if(GRID.head.value!==0){
			const buffer=GRID.head;
			if(resetEvent!==null)GRID.head=resetEvent.head;
			area=[
				(getTopBorder(GRID.head)??0)/2-0.5,(getRightBorder(GRID.head)??0)/2+0.5,
				(getBottomBorder(GRID.head)??0)/2+0.5,(getLeftBorder(GRID.head)??0)/2-0.5];
			patternCode=baseNToLZ77(patternToBaseN(readPattern(...area,GRID)));
			GRID.head=buffer;
			text+=`&pat=${area.join(".")}.${patternCode}`;
		}
	}else{
		area=[GRID.finiteArea.top,GRID.finiteArea.right,GRID.finiteArea.bottom,GRID.finiteArea.left];
		patternCode=baseNToLZ77(patternToBaseN(GRID.finiteArray));
		text+=`&pat=${area.join(".")}.${GRID.type}.${patternCode}`;
	}

	if(document.getElementById("density").value!=="50"){
		text+="&ratio="+document.getElementById("density").value;
	}

	let markerString="";
	for(let i=0;i<markers.length;i++){
		if(markers[i].activeState){
			if(markerString!=="")markerString+=".";
			markerString+=`${i}.${markers[i].top}.${markers[i].right}.${markers[i].bottom}.${markers[i].left}.${baseNToLZ77(patternToBaseN(markers[i].pattern))}.`;
		}
		if(markers[i].shipInfo.dx!==null){
			markerString+=`${markers[i].shipInfo.phases[0].length},${markers[i].shipInfo.phases[0][0].length},${markers[i].shipInfo.dx},${markers[i].shipInfo.dy},${markers[i].shipInfo.shipOffset.x},${markers[i].shipInfo.shipOffset.y}`;
			for(let j=0;j<markers[i].shipInfo.phases.length;j++){
				markerString+=","+baseNToLZ77(patternToBaseN(markers[i].shipInfo.phases[j]));
			}
		}
	}
	if(markerString!=="")text+="&marker="+markerString;

	if(document.getElementById("rleMargin").value!=="16")text+="&rleMargin="+document.getElementById("rleMargin").value;

	if(isElementCheckedById("userReset")===true)text+="&userReset=true";

	const options=document.getElementById("searchOptions").children;
	if(options.length>1){
		text+="&search=";
		for(let i=0;i<options.length-1;i++){
			for(let j=1;j<options[i].children.length-1;j++){
				if(j===1){
					if(i!==0)text+=".";
				}else{
					text+=",";
				}
				if(options[i].children[j].className.includes("dropdown")){
					text+=encodeURIComponent(options[i].children[j].children[0].innerHTML);
				}else if(options[i].children[j].tagName==="INPUT"){
					text+=encodeURIComponent(options[i].children[j].value);
				}
			}
		}
	}

	document.getElementById("settingsExport").innerHTML=text;
	document.getElementById("settingsExport").href=text;

	if(resetEvent!==null)setEvent(currentEvent);
}

//mouse input
canvas.onmousedown = function(event){
	if(event.target.nodeName==="CANVAS")canvas.focus();
	edgeBeingDragged=0;
	inputReset();
	pointers.push(new Pointer((event.clientX-canvas.getBoundingClientRect().left),(event.clientY-canvas.getBoundingClientRect().top)));
	if(editMode===0){
		//coordinates of the touched cell
		let x=Math.floor(((pointers[0].X-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
		let y=Math.floor(((pointers[0].Y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
		worker.postMessage({type:"writeCell",args:[x,y,state]});
	}
	if(runMainLoop===false&&isPlaying===0){
		if(pointers.length>0)update();
		// TODO: replace render() here
	}
	event.preventDefault();
};

canvas.onmousemove = function(event){
	if(pointers.length>0){
		pointers[0].X=event.clientX-canvas.getBoundingClientRect().left;
		pointers[0].Y=event.clientY-canvas.getBoundingClientRect().top;
	}
	if(drawnState!==-1){
	}
		
	if(pointers.length>0&&runMainLoop===false&&isPlaying===0){
		update();
		// TODO: replace render() here
	}
};

window.onmouseup = function(event){
	edgeBeingDragged=0;
	inputReset();
	pointers.splice(0,1);
	if(runMainLoop===false&&isPlaying===0){
		if(pointers.length>0)update();
		// TODO: replace render() here
	}
};

window.addEventListener("copy", (event) => {
	if (/[^input|textarea|select]/i.test(document.activeElement.tagName)) {
		if(event.cancelable)event.preventDefault();
		navigator.clipboard.writeText(exportRLE()).then(
			() => {
				console.log("successfully copied");
			},
			() => {
				alert("failed to copy pattern to clipboard");
			}
		);
	}
});

window.addEventListener("paste", (event) => {
	if (/[^input|textarea|select]/i.test(document.activeElement.tagName)) {
		if(event.cancelable)event.preventDefault();
		const text=event.clipboardData||window.clipboardData;
		importRLE(text.getData("text"));
	}
});

window.onkeydown = function(event){
	//if a key is pressed for the first time then reset the timer for the movement multiplier
	if(runMainLoop===false)timeOfLastUpdate=0;
	
	if(event.ctrlKey===false&&event.keyCode!==9&&event.keyCode!==32&&(event.keyCode<37||event.keyCode>40)&&event.target.nodeName!=="TEXTAREA"&&(event.target.nodeName!=="INPUT"||event.target.type!="text")){
		key[event.keyCode]=true;
		//TODO: change this to fit with worker backend

		if(isPlaying===0&&runMainLoop===false)requestAnimationFrame(main);
		//set the flag that a key is down
		runMainLoop=true;

		switch(event.keyCode){
		case 13://enter
			start();
			break;
		case 46://delete
			deleteMarker();
			break;
		case 49://1
			draw();
			break;
		case 50://2
			move();
			break;
		case 51://3
			select();
			break;
		case 67://c
			setTimeout(() => { copy();});
			break;
		case 70://f
			if(pasteArea.isActive){
				//to rotate the paste area
				if(key[16]){
					//counter clockwise
					flipOrtho("vertical");
				}else{
					//clockwise
					flipOrtho("horizonal");
				}
			}else{
				fitView();
			}
			break;
		case 73://i
			invertGrid();
			break;
		case 75://k
			clearGrid();
			break;
		case 77://m
			setMark();
			break;
		case 78://n
			next();
			break;
		case 82://r
			if(selectArea.isActive){
				//to randomize the select area
				randomizeGrid(selectArea);
			}else if(pasteArea.isActive){
				//to rotate the paste area
				flipDiag();
				if(key[16]){
					//counter clockwise
					flipOrtho("vertical");
				}else{
					//clockwise
					flipOrtho("horizonal");
				}
			}
			break;
		case 83://s
			if(key[16])selectAll();//and shift
			break;
		case 84://t
			reset(isElementCheckedById("resetStop")===true);
			resetActions();
			break;
		case 86://v
			paste();
			// TODO: replace render() here
			break;
		case 88://x
			cut();
			break;
		case 90://z
			if(key[16]){
				redo();
			}else{
				undo();
			}
			break;
		}
		event.preventDefault();
	}
};

window.onkeyup = function(event){
	key[event.keyCode]=false;

	runMainLoop=false;
	for(let h in key){
		if(key[h]===true)runMainLoop=true;
	}
};

window.onresize = function(){
	if(isPlaying===0){
		scaleCanvas();
		// TODO: replace render() here
	}
	updateDropdownMenu();
};

window.onscroll = function(){
	captureScroll=false;
	updateDropdownMenu();
};

//touch inputs
function reloadPointers(event){
	for (let i = 0; i < event.touches.length; i++) {
		if(pointers.length<=i){
			pointers.push(new Pointer((event.touches[i].clientX-canvas.getBoundingClientRect().left),(event.touches[i].clientY-canvas.getBoundingClientRect().top)));
		}
		pointers[i].X=event.touches[i].clientX-canvas.getBoundingClientRect().left;
		pointers[i].Y=event.touches[i].clientY-canvas.getBoundingClientRect().top;
	}
	if(runMainLoop===false&&isPlaying===0){
		if(pointers.length>0)update();
		// TODO: replace render() here
	}
}

function resetPointers(event){
	edgeBeingDragged = 0;
	if(event.cancelable)event.preventDefault();
	inputReset();

	pointers=[];
	reloadPointers(event);
}

canvas.ontouchstart = resetPointers;

canvas.ontouchend = resetPointers;

canvas.ontouchmove = reloadPointers;

//controls zooming of the camera using the mouse wheel
canvas.onwheel = function(event){
	if(captureScroll===true){
		if(event.cancelable)event.preventDefault();
		const mouseX = event.clientX-canvas.getBoundingClientRect().left;
		const mouseY = event.clientY-canvas.getBoundingClientRect().top;
		zoom(1-0.1*Math.sign(event.deltaY), mouseX, mouseY);

		if(runMainLoop===false&&isPlaying===0){
			if(pointers.length>0)update();
			// TODO: replace render() here
		}
	}
};

function previewFile() {
	const content = document.getElementById("rle");
	const [file] = document.querySelector("input[type=file]").files;
	const reader = new FileReader();

	reader.addEventListener( "load", () => {
			// this will then display a text file
			content.value = reader.result;
			importRLE(reader.result);
		},
		false,
	);

	if (file) {
		reader.readAsText(file);
	}
}

function download(){
	var hiddenElement = document.createElement('a');
	hiddenElement.href = 'data:attachment/text,' + encodeURI(document.getElementById("rle").value);
	hiddenElement.target = '_blank';
	hiddenElement.download = 'pattern.rle';
	hiddenElement.click();
}

//update the randomize density slider
document.getElementById("density").oninput = function() {
	document.getElementById("percent").innerText = `${this.value}%`;
};

function updateDropdownMenu(){
	let dropdownElements=document.getElementsByClassName("dropdown");
	for(let i=0;i<dropdownElements.length;i++){
		let dropdownHeight=parseInt(dropdownElements[i].children[1].getBoundingClientRect().height);
		let dropdownPosition=dropdownElements[i].children[0].getBoundingClientRect();
		
		if(dropdownPosition.top<dropdownHeight||dropdownPosition.bottom+dropdownHeight<window.innerHeight){
			//place dropdown under button
			dropdownElements[i].children[1].style.bottom="unset";
		}else{
			//place dropdown over button
			dropdownElements[i].children[1].style.bottom=dropdownElements[i].offsetHeight+"px";
		}
	}
}

//resets various values at the start and end of inputs
function inputReset(){
	captureScroll=true;
	//reset viewport variables
	view.touchX=view.x;
	view.touchY=view.y;
	view.touchZ=view.z;
	//reset drawState and save any changes to the grid
	if(drawnState!==-1){
		drawnState=-1;
		let currentChange=accumulateChanges, changedCells=new Array(changeCount);
		for(let i=0;i<changeCount;i++){
			if(currentChange.parent===null)break;
			currentChange=currentChange.parent;
			changedCells[i]=currentChange.value;
		}

		if(socket&&resetEvent===null)socket.emit("draw", Date.now(), changedCells);
		currentEvent=new EventNode(currentEvent, Date.now(), "draw", changedCells);
		
		changeCount=0;
		accumulateChanges=new ListNode(null);
	}
	if(GRID.finiteArea.newTop!==GRID.finiteArea.top||GRID.finiteArea.newRight!==GRID.finiteArea.right||GRID.finiteArea.newBottom!==GRID.finiteArea.bottom||GRID.finiteArea.newLeft!==GRID.finiteArea.left){
		let resizedArray=new Array(GRID.finiteArea.newRight-GRID.finiteArea.newLeft+(GRID.type===1?2:0));
		for(let i=0; i<resizedArray.length;i++){
			resizedArray[i]=new Array(GRID.finiteArea.newBottom-GRID.finiteArea.newTop+(GRID.type===1?2:0));
			for(let j=0; j<resizedArray[0].length;j++){
				if(i>=GRID.finiteArea.left-GRID.finiteArea.newLeft+GRID.finiteArea.margin&&i<GRID.finiteArea.left-GRID.finiteArea.newLeft+GRID.finiteArray.length-GRID.finiteArea.margin&&j>=GRID.finiteArea.top-GRID.finiteArea.newTop+GRID.finiteArea.margin&&j<GRID.finiteArea.top-GRID.finiteArea.newTop+GRID.finiteArray[0].length-GRID.finiteArea.margin){
					resizedArray[i][j]=GRID.finiteArray[i+GRID.finiteArea.newLeft-GRID.finiteArea.left][j+GRID.finiteArea.newTop-GRID.finiteArea.top];
				}else{
					resizedArray[i][j]=GRID.backgroundState;
				}
			}
		}
		GRID.finiteArray=resizedArray;
		GRID.finiteArea.top=GRID.finiteArea.newTop;
		GRID.finiteArea.right=GRID.finiteArea.newRight;
		GRID.finiteArea.bottom=GRID.finiteArea.newBottom;
		GRID.finiteArea.left=GRID.finiteArea.newLeft;
	}

	//reset the markers
	selectedMarker=-1;
	if(selectArea.left===selectArea.right||selectArea.top===selectArea.bottom){
		selectArea.isActive=false;
		setActionMenu();
	}
}

//gets key inputs
function keyInput(){
	//] to zoom in
	if(key[221]){
		zoom(1+0.05*frameMultiplier);
	}
	//[ to zoom out
	if(key[219]){
		zoom(1/(1+0.05*frameMultiplier));
	}
	//wasd keys for move when shift is not pressed
	if(!key[16]){
		if(key[65]) view.x-=0.5/view.z*frameMultiplier;
		if(key[87]) view.y-=0.5/view.z*frameMultiplier;
		if(key[68]) view.x+=0.5/view.z*frameMultiplier;
		if(key[83]) view.y+=0.5/view.z*frameMultiplier;
		if((key[65]||key[87]||key[68]||key[83]||key[219]||key[221])&&resetEvent===null){
			if(socket)socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
			//coordinates of the touched cell
			console.log(view.x, view.y);
			worker.postMessage({type:"move",args:[view.x,view.y,view.z]});
		}
	}
}

function getColor(cellState){
	// if(document.getElementById("antiStrobing").checked)cellState=(cellState-GRID.backgroundState+rule.length)%rule.length;

	if(ruleMetadata.color[cellState]){
		return ruleMetadata.color[cellState];
	}else if(darkMode){
		if(cellState===0){
			return "#222";
		}else if(cellState===1){
			return "#f1f1f1";
		}else{
			let color=240/rule.length*(rule.length-cellState);
			return `rgb(${color},${color},${color})`;
		}
	}else{
		if(cellState===0){
			return "#f1f1f1";
		}else if(cellState===1){
			return "#000";
		}else{
			let color=240/rule.length*(cellState-1);
			return `rgb(${color},${color},${color})`;
		}
	}
}

//switch to draw mode
function draw(){
	if(pasteArea.isActive){
		resetClipboard();
	}
	captureScroll=true;
	editMode=0;
	if(isPlaying===0)render();
}

//switch to move mode
function move(){
	editMode=1;
	captureScroll=true;
	console.log("set move mode");
}

//swith to select mode
function select(){
	if(selectArea.isActive===true&&editMode===2)selectArea.isActive=false;
	resetClipboard();
	setActionMenu();
	editMode=2;
	captureScroll=true;
	if(isPlaying===0)render();
}

function setActionMenu(){
	for(let button of document.getElementsByClassName("displayIf")){
		button.style.display="none";
		if(button.classList.contains("select")&&selectArea.isActive===true )button.style.display="block";
		if(button.classList.contains("noSelect")&&selectArea.isActive===false)button.style.display="block";
		if(button.classList.contains("noArea")&&selectArea.isActive===false&&pasteArea.isActive===false)button.style.display="block";
		if(button.classList.contains("paste")&&pasteArea.isActive ===true )button.style.display="block";
		if(button.classList.contains("marker")){
			for (let i = 0; i < markers.length; i++) {
				if(markers[i].activeState>1){
					button.style.display="block";
					break;
				}
			}
		}
	}
}

//TODO: rewrite

function setDrawMenu(){
// 	document.getElementById("drawMenu").children[1].innerHTML="<button onclick=\"changeDrawMode(this);\" style=\"display: none;\">Cycle</button>";
// 	for(let i=0;i<rule.length;i++){
// 		document.getElementById("drawMenu").children[1].innerHTML+=`<button onclick="changeDrawMode(this);">${i}</button>`;
//
// 		if(i!==0)document.getElementById("drawMenu").children[1].children[i+1].style.backgroundColor=getColor(i);
// 		if(i>rule.length*0.8||i===0){
// 			if(darkMode){
// 				document.getElementById("drawMenu").children[1].children[i+1].style.color="#bbb";
// 			}else{
// 				document.getElementById("drawMenu").children[1].children[i+1].style.color="#000";
// 			}
// 		}else{
// 			if(darkMode){
// 				document.getElementById("drawMenu").children[1].children[i+1].style.color="#000";
// 			}else{
// 				document.getElementById("drawMenu").children[1].children[i+1].style.color="#bbb";
// 			}
// 		}
// 	}
}

function identify(){
	const startTime=Date.now();
	if(selectArea.isActive===false)selectAll();
	let patternInfo=findShip(readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left),selectArea);
	if(patternInfo.period===0){
		alert("couldn't recognize periodic pattern");
		return;
	}
	document.getElementById("identifyOutput").innerHTML=`
		<span>
			select area width: ${selectArea.right-selectArea.left}\n
			select area height: ${selectArea.bottom-selectArea.top}\n
			period: ${patternInfo.period}\n
			x displacement: ${patternInfo.dx}\n
			y displacement: ${patternInfo.dy}
			time elapsed: ${Math.ceil(Date.now()-startTime)}
		</span>
		<canvas id="identifiedShip" style="float: none;margin: none;"></canvas>`;
	let canvasElement=document.getElementById("identifiedShip").getContext("2d");

	const bitmap=patternToBitmap(patternInfo.phases[0]);
	document.getElementById("identifiedShip").width=bitmap.width;
	document.getElementById("identifiedShip").height=bitmap.height;
	canvasElement.drawImage(bitmap,0,0);
}

function getTopPatternMargin(pattern,rangeStart=0,rangeEnd=pattern.length){
	for(let j=0; j<pattern[0].length; j++){
		for(let i=rangeStart; i<rangeEnd; i++){
			if(pattern[i][j]!==0){
				return j;
			}
		}
	}
	return -1;
}

function getRightPatternMargin(pattern,rangeStart=0,rangeEnd=pattern[0].length){
	for(let i=pattern.length-1; i>=0; i--){
		for(let j=rangeStart; j<rangeEnd; j++){
			if(pattern[i][j]!==0){
				return i+1;
			}
		}
	}
	return -1;
}

function getBottomPatternMargin(pattern,rangeStart=0,rangeEnd=pattern.length){
	for(let j=pattern[0].length-1; j>=0; j--){
		for(let i=rangeStart; i<rangeEnd; i++){
			if(pattern[i][j]!==0){
				return j+1;
			}
		}
	}
	return -1;
}

function getLeftPatternMargin(pattern,rangeStart=0,rangeEnd=pattern[0].length){
	for(let i=0; i<pattern.length; i++){
		for(let j=rangeStart; j<rangeEnd; j++){
			if(pattern[i][j]!==0){
				return i;
			}
		}
	}
	return -1;
}

function getSpaceshipEnvelope(ship,grid,area){
	const maxPeriod=300, initialGrid=grid.head, initialEvent=new EventNode(null);
	const startLocation=findPattern(readPattern(area.top,area.right,area.bottom,area.left,grid),ship);
	if(-1===startLocation.x){
		console.trace();
		console.log("can't find ship");
		return {dx:null, dy:null, period:0};
	}

	const initialShipPosition=[
		startLocation.y+area.top,
		startLocation.x+area.left+ship.length,
		startLocation.y+area.top +ship[0].length,
		startLocation.x+area.left];
	let searchArea = new Array(4), spaceshipEnvelope=[...initialShipPosition];

	let speedOfLight=1;//0.5;
	//if(ruleHasLightSpeedShips)speedOfLight=1;

	for(let period=1;period<maxPeriod;period++){
		gen(grid);
		searchArea[0]=initialShipPosition[0]-Math.floor(period*speedOfLight);
		searchArea[1]=initialShipPosition[1]+Math.ceil( period*speedOfLight);
		searchArea[2]=initialShipPosition[2]+Math.ceil( period*speedOfLight);
		searchArea[3]=initialShipPosition[3]-Math.floor(period*speedOfLight);

		const search=readPattern(...searchArea,grid);
		let location=findPattern(readPattern(...searchArea,grid),ship);
		spaceshipEnvelope[0]=Math.min(searchArea[0]+getTopPatternMargin(search)   ,spaceshipEnvelope[0]);
		spaceshipEnvelope[1]=Math.max(searchArea[3]+getRightPatternMargin(search) ,spaceshipEnvelope[1]);
		spaceshipEnvelope[2]=Math.max(searchArea[0]+getBottomPatternMargin(search),spaceshipEnvelope[2]);
		spaceshipEnvelope[3]=Math.min(searchArea[3]+getLeftPatternMargin(search)  ,spaceshipEnvelope[3]);

		if(location.x!==-1){
			grid.head=initialGrid;
			let shipPattern=new Array(period);
			//find pattern
			for(let j=0;j<period;j++){
				shipPattern[j]=readPattern(...spaceshipEnvelope,grid);
				gen(grid);
			}
			setEvent(initialEvent);
			return {
				dx:(location.x+searchArea[3])-(startLocation.x+area.left),
				dy:(location.y+searchArea[0])-(startLocation.y+area.top),
				shipOffset:{x:spaceshipEnvelope[3]-area.left,y:spaceshipEnvelope[0]-area.top},
				period:period,
				phases:shipPattern
			};
		}
	}
	setEvent(initialEvent);
	return {dx:null, dy:null, shipOffset:{x:null,y:null},period:0,phases:[]};
}

function findShip(ship,area){
	if(-1===findPattern(readPattern(area.top,area.right,area.bottom,area.left),ship).x){
		let size=8;
		while(size<ship.length*2){
			size*=2;
			if(size>maxDepth){
				console.log("pattern too large");
				return {dx:null, dy:null, shipOffset:{x:null,y:null}, period:0, phases:[]};
			}
		}
		let sandbox={
			head:getEmptyNode(size),
			backgroundState:0,
			type:0};
		sandbox.head=writePatternToGrid(-size/4,-size/4,ship,sandbox.head);

		return getSpaceshipEnvelope(ship,sandbox,{top:-size/4, right:size/4, bottom:size/4, left:-size/4});
	}else{
		return getSpaceshipEnvelope(ship,GRID,area);
	}
}

function patternToBitmap(pattern){
	const cellWidth = 200/(pattern.length);
	const canvasWidth=200, canvasHeight=Math.ceil(cellWidth*(pattern[0].length));
	const offscreenCanvas = new OffscreenCanvas(canvasWidth,canvasHeight);
	const context = offscreenCanvas.getContext("2d");
	context.scale(1,1);

	if(darkMode){
		context.strokeStyle="#999";
	}else{
		context.strokeStyle="#000000";
	}

	for(let i=0;i<pattern.length;i++){
		for(let j=0;j<pattern[i].length;j++){
			context.fillStyle=getColor(pattern[i][j]);
			if(pattern[i][j]!==0)context.fillRect(i*cellWidth,j*cellWidth,1*cellWidth,1*cellWidth);
		}
	}
	context.lineWidth=1;
	context.beginPath();
	for(let i=0;i<=pattern.length;i++){
		context.moveTo(i*cellWidth,0);
		context.lineTo(i*cellWidth,pattern[0].length*cellWidth);
	}
	for(let i=0;i<=pattern[0].length;i++){
		context.moveTo(0,i*cellWidth);
		context.lineTo(pattern.length*cellWidth,i*cellWidth);
	}
	context.stroke();

	return offscreenCanvas.transferToImageBitmap();
}

function setMenu(elementId, value){
	if(!document.getElementById(elementId))return;
	for (let i = 0; i < document.getElementById(elementId).children[1].children.length; i++) {
		document.getElementById(elementId).children[1].children[i].style.display="block";
	}
	document.getElementById(elementId).children[1].children[value].style.display="none";
	document.getElementById(elementId).children[0].innerHTML=document.getElementById(elementId).children[1].children[value].innerHTML;
}

function searchAction(element){
	let conditions=element.getElementsByClassName("condition");
	if(conditions.length<=1)return -1;
	for(let i=0;i<conditions.length-1;i++){
		if((conditions[i].condition(element)!==true)===
			(conditions[i].previousElementSibling.children[0].innerText==="When")){
			return -2;
		}
	}
	element.action(element);
	return 0;
}

//TODO: add comments to this function
function integerDomainToArray(string){
	let values=string.split(",");
	for(let i=0;i<values.length;i++){
		if(values[i].split("").includes("-")){
			const endPoints=values[i].split("-").map(num => parseInt(num));
			let range=new Array(endPoints[1]-endPoints[0]+1);
			for(let j=0;j<range.length;j++){
				range[j]=endPoints[0]+j;
			}
			values[i]=range;
		}else{
			values[i]=parseInt(values[i]);
		}
	}
	return values.flat();
}

function setSalvoIteration(optionElement, value){
	let areaLeft, areaTop, salvoInfo=optionElement.info, shipInfo;
	if(optionElement.children[3].children[0].innerHTML==="Active Paste"){
		if(pasteArea.isActive===false)return -1;
		if(clipboard[activeClipboard].shipInfo.dx===null){
			clipboard[activeClipboard].shipInfo=findShip(clipboard[activeClipboard].pattern,pasteArea);
			salvoInfo.minAppend=0;
			salvoInfo.minIncrement=0;
			salvoInfo.progress=[{delay:[0],repeatedResult:false,result:null}];
			shipInfo=clipboard[activeClipboard].shipInfo;
			if(shipInfo.period===0){
				alert("Couldn't find ship. I need an area that contains only the spaceship.");
				return -1;
			}else{
				alert(`Found (${[Math.abs(shipInfo.dx),Math.abs(shipInfo.dy)]})c/${shipInfo.period}`);
			}
		}
		shipInfo=clipboard[activeClipboard].shipInfo;
		//location of ship within the paste area
		areaLeft=pasteArea.left+shipInfo.shipOffset.x;
		areaTop=pasteArea.top+shipInfo.shipOffset.y;
	}else if(optionElement.children[3].children[0].innerHTML.match(/Marker .+/)){
		const marker=markers[parseInt(optionElement.children[3].children[0].innerHTML.slice(7))-1];
		if(marker.isActive===0)return -1;
		if(marker.shipInfo.dx===null){
			marker.shipInfo=findShip(marker.pattern,marker);
			salvoInfo.minAppend=0;
			salvoInfo.minIncrement=0;
			salvoInfo.progress=[{delay:[0],repeatedResult:false,result:null}];
			shipInfo=clipboard[activeClipboard].shipInfo;
			if(shipInfo.period===0){
				alert("Couldn't find ship. I need an area that contains only the spaceship.");
				return -1;
			}else{
				alert(`Found ${[Math.abs(shipInfo.dx),Math.abs(shipInfo.dy)]}c/${shipInfo.period}`);
			}
		}
		shipInfo=marker.shipInfo;
		areaLeft=marker.left+shipInfo.shipOffset.x;
		areaTop=marker.top+shipInfo.shipOffset.y;
	}

	if(shipInfo.dx===0&&shipInfo.dy===0){
		alert("Still Life/Oscillator Dectected. I can only use patterns which move to make a salvo.");
		return -1;
	}else{
		if(value+1<salvoInfo.progress.length){
			salvoInfo.progress=[{delay:[0],repeatedResult:false,result:null}];
			salvoInfo.minIncrement=0;
			salvoInfo.minAppend=0;
		}
		for(let i = salvoInfo.progress.length; i < value+1; i++){
			incrementSearch(salvoInfo);
		}

		let salvoArea={top:0,right:0,bottom:0,left:0};
		let lastShipPosition=-Math.ceil(salvoInfo.progress.slice(-1)[0].delay.slice(-1)[0]/shipInfo.period);
		salvoArea.top=areaTop+Math.min(0,lastShipPosition*shipInfo.dy);
		salvoArea.right=areaLeft+Math.max(0,lastShipPosition*shipInfo.dx)+shipInfo.phases[0].length;
		salvoArea.bottom=areaTop+Math.max(0,lastShipPosition*shipInfo.dy)+shipInfo.phases[0][0].length;
		salvoArea.left=areaLeft +Math.min(0,lastShipPosition*shipInfo.dx);
		GRID.head=widenTree(salvoArea);
		let clearedArray = new Array(salvoArea.right-salvoArea.left);
		for(let i=0; i< clearedArray.length; i++){
			clearedArray[i]=new Array(salvoArea.bottom-salvoArea.top);
			clearedArray[i].fill(0);
		}
		const previousPattern=readPattern(salvoArea.top,salvoArea.right, salvoArea.bottom,salvoArea.left);
		writePattern(salvoArea.left,salvoArea.top, clearedArray, GRID);

		for(let i=0;i<salvoInfo.progress.slice(-1)[0].delay.length;i++){
			let LeftPosition=salvoInfo.progress.slice(-1)[0].delay[i]/shipInfo.period;
			let TopPosition=salvoInfo.progress.slice(-1)[0].delay[i]/shipInfo.period;
			const xPosition=(areaLeft-Math.ceil(LeftPosition)*shipInfo.dx+0*Math.min(0,shipInfo.dx));
			const yPosition=(areaTop-Math.ceil(TopPosition)*shipInfo.dy+0*Math.min(0,shipInfo.dy));
			const pattern=shipInfo.phases[mod(-salvoInfo.progress.slice(-1)[0].delay[i],shipInfo.period)];
			writePattern(xPosition,yPosition, pattern, GRID);
		}
		
		if(socket)socket.emit("paste", Date.now(), {newPatt:[salvoArea.left,salvoArea.top,readPattern(salvoArea.top,salvoArea.right, salvoArea.bottom,salvoArea.left)], oldPatt:[salvoArea.left,salvoArea.top,previousPattern]});
		optionElement.children[4].value=value;
		currentEvent=new EventNode(currentEvent,"generate salvo");
	}
	
	if(isPlaying===0)render();
}

function duplicateLastChild(element){
	element.appendChild(element.lastElementChild.cloneNode(true));
}

function setGridType(gridNumber){
	let results=exportPattern();
	GRID.type=gridNumber;
	if(socket)socket.emit("changeGrid", [results.pattern,gridNumber,results.xOffset,results.yOffset]);
	console.log("importGridPattern");

	importPattern(results.pattern,gridNumber,results.xOffset,results.yOffset);
	currentEvent=new EventNode(currentEvent,"changeGrid");
}

function changeCondition(element){
	const conditions = [{
		name: "Reset",
		condition: () => wasReset
	},{
		name: "Pattern Stablizes",
		condition: (baseElementIndex, element) => {
			let indexedEvent=currentEvent.parent;
			let excludedPeriods=integerDomainToArray(element.children[baseElementIndex+1].value);
			for(let i=1;i<100;i++){
				if(!indexedEvent)break;
				if(GRID.head===indexedEvent.head){
					if(!excludedPeriods.includes(i))return true;
					break;
				}
				indexedEvent=indexedEvent.parent;
			}
			return false;
		}
	},{
		name: "Generation",
		condition: (baseElementIndex, element) => genCount>=parseInt(element.children[baseElementIndex+1].value)
	},{
		name: "Population",
		condition: (baseElementIndex, element) => {
			let populationCounts=integerDomainToArray(element.children[baseElementIndex+1].value);
			if(GRID.type===0){
				return populationCounts.includes(GRID.head.population);
			}else{
				return populationCounts.includes(gridPopulation);
			}
		}
	},{
		name: "Pattern Contains",
		condition: (baseElementIndex, element) => {
			let pattern=[];
			if(element.children[baseElementIndex+1].children[0].innerHTML==="Select Area"&&selectArea.isActive){
				pattern=readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left);
			}else if(element.children[baseElementIndex+1].children[0].innerHTML.includes("Marker")){
				//get marker based on the number within the button element
				const marker=markers[parseInt(element.children[baseElementIndex+1].children[0].innerHTML.slice(7))-1];
				if(marker.activeState!==0){
					pattern=readPattern(marker.top,marker.right,marker.bottom,marker.left);
				}else{
					pattern=[];
				}
			}else if(element.children[baseElementIndex+1].children[0].innerHTML.includes("Copy Slot")){
				//get clipboard based on the number within the button element
				pattern=clipboard[parseInt(element.children[baseElementIndex+1].children[0].innerHTML.slice(10))].pattern;
			}
			if(!pattern||pattern.length===0)return false;
			if(element.children[baseElementIndex+2].children[0].innerHTML==="Select Area"){
				return selectArea.isActive&&-1!==findPattern(readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left),pattern).x;
			}else if(element.children[baseElementIndex+2].children[0].innerHTML.includes("Marker")){
				const marker=markers[parseInt(element.children[baseElementIndex+2].children[0].innerHTML[7])-1];
				if(marker.activeState!==0){
					return -1!==findPattern(readPattern(marker.top,marker.right,marker.bottom,marker.left),pattern).x;
				}else{
					return false;
				}
			}else{
				return false;
			}
		}
	}];

	const dropdown=element.parentElement.parentElement;

	while(dropdown.nextSibling){
		dropdown.nextSibling.remove();
	}

	replaceDropdownElement(element);
	let index = Array.from(dropdown.parentElement.children).indexOf(dropdown);
	for(let i=0;i<conditions.length;i++){
		if(conditions[i].name===element.innerText){
			dropdown.condition=newElement => conditions[i].condition(index,newElement);
			dropdown.parentElement.appendChild(document.getElementById(conditions[i].name+" Condition Template").content.cloneNode(true));
			dropdown.parentElement.appendChild(document.getElementById("conditionHTML").content.cloneNode(true));
			break;
		}
	}
	updateSelectors();
}

function changeAction(element){
	const actions=[{
		name: "Reset",
		action: () => {reset(false);}
	},{
		name: "Shift",
		action: (element) => {
			if(element.children[2].children[0].innerHTML==="Select Area"){
				selectArea.top+=parseInt(element.children[4].value);
				selectArea.right+=parseInt(element.children[3].value);
				selectArea.bottom+=parseInt(element.children[4].value);
				selectArea.left+=parseInt(element.children[3].value);
			}else if(element.children[2].children[0].innerHTML==="Paste Area"&&pasteArea.isActive){
				pasteArea.top+=parseInt(element.children[4].value);
				pasteArea.left+=parseInt(element.children[3].value);
				currentEvent=writePatternAndSave(pasteArea.left,pasteArea.top,clipboard[activeClipboard].pattern);
				if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
			}
		}
	},{
		name: "Randomize",
		action: (element) => {
			if(selectArea.isActive&&element.children[2].children[0].innerHTML==="Select Area"){
				randomizeGrid(selectArea);
			}else if(element.children[2].children[0].innerHTML.includes("Marker")){
				const marker=markers[parseInt(element.children[2].children[0].innerHTML[7])-1];
				if(marker.activeState!==0)randomizeGrid(marker);
			}
			currentEvent=new EventNode(currentEvent, "randomize");
		}
	},{
		name: "Save Pattern",
		action: () => {
			if(document.getElementById("rle").value==="")document.getElementById("rle").value="x = 0, y = 0, rule = "+exportRulestring()+"\n";
			document.getElementById("rle").value=appendRLE(exportRLE());
		}
	},{
		name: "Generate Salvo",
		Info: class{
			constructor(){
				this.repeatTime=0;
				this.minIncrement=0;
				this.minAppend=0;
				this.progress=[{delay:[0],repeatedResult:false,result:null}];
			}
		},
		action: (element) => {
				setSalvoIteration(element,parseInt(element.children[4].value)+1);
		}},
	{name: "Increment Area",
		action: (element) => {
			if(selectArea.isActive&&element.children[2].children[0].innerHTML==="Select Area"){
				incrementArea(selectArea);
			}else if(element.children[2].children[0].innerHTML.includes("Marker")){
				const marker=markers[parseInt(element.children[2].children[0].innerHTML[7])-1];
				if(marker.activeState!==0)incrementArea(marker);
			}
			currentEvent=new EventNode(currentEvent, "increment area");
		}
	}];

	const option=element.parentElement.parentElement.parentElement;
	while(element.parentElement.parentElement.nextSibling){
		element.parentElement.parentElement.nextSibling.remove();
	}

	//add another space to the search options when the last is selected
	if(document.getElementById("searchOptions").lastElementChild===option){
		duplicateLastChild(document.getElementById("searchOptions"));
	}
	
	replaceDropdownElement(element);

	for(let i=0;i<actions.length;i++){
		if(actions[i].name===element.innerText){
			option.action=actions[i].action;
			option.conditions=[];
			option.appendChild(document.getElementById(actions[i].name+" Action Template").content.cloneNode(true));
			option.appendChild(document.getElementById("conditionHTML").content.cloneNode(true));
			//append a reset option to the top level condition dropdown(prevents feedbackloops by only adding reset condition to non reset actions)
			if(element.innerText!=="Reset"){
				option.lastElementChild.children[1].innerHTML+="<button onclick='changeCondition(this);'>Reset</button>";
			}
			//when setting up the condition, add info if the template has the Info property(and if the info property doesn't exist FSR? breaks without 2nd part)
			if(actions[i].Info&&!("info" in option)){
				console.log("init ship");
				option.info=new actions[i].Info(option);
			}else if(!actions[i].Info&&("info" in option)){
				//removes the info condition if a action with "Info" is changed to one without
				delete option.info;
				console.log(option);
				console.log("deleted info property from an element which shouldn't have it");
			}
			break;
		}
	}
	updateSelectors();
}

function replaceDropdownElement(target){
	let dropdown = target.parentElement;
	
	//replaces the main button with the new action
	dropdown.previousElementSibling.innerHTML=target.innerHTML;
	
	//hide the selected option within the dropdown menu
	for(let i=0;i<dropdown.children.length;i++){
		dropdown.children[i].style.display="block";
	}
	target.style.display="none";
}

function showPreview(element){
	let previewCanvas=element.lastElementChild;
	const clipboardIndex=parseInt(element.innerText);
	if(clipboard[clipboardIndex].pattern[0]){
		if(clipboard[clipboardIndex].previewBitmap===null){
			clipboard[clipboardIndex].previewBitmap=patternToBitmap(clipboard[clipboardIndex].pattern);
		}

		previewCanvas.width=clipboard[clipboardIndex].previewBitmap.width;
		previewCanvas.height=clipboard[clipboardIndex].previewBitmap.height;
		previewCanvas.getContext("2d").drawImage(clipboard[clipboardIndex].previewBitmap,0,0);
	}
}

function changeCopySlot(target){
	let dropdown = target.parentElement;

	if(document.getElementById("copyMenu").lastElementChild===target){
		duplicateLastChild(dropdown);
		dropdown.lastElementChild.innerHTML=`${dropdown.children.length}<canvas class="patternPreview"></canvas>`;
		clipboard.push({pattern:[],shipInfo:{dx:null,dy:null,phases:[]},previewBitmap:null});
	}
	
	//update the copy slot settings
	activeClipboard=parseInt(target.innerText);

	replaceDropdownElement(target);
	//update the menus containing "Select Area","Marker 1", "Marker 2", etc...
	updateSelectors();
	if(isPlaying===0)render();
}

function changeGridType(target){
	let dropdown = target.parentElement;

	let targetIndex = Array.from(dropdown.children).indexOf(target);
	if(GRID.type!==targetIndex)setGridType(targetIndex);

	replaceDropdownElement(target);
	if(isPlaying===0)render();
}

function changeDrawMode(target){
	let dropdown = target.parentElement;

	//update the draw state settings
	state=Array.from(dropdown.children).indexOf(target)-1;

	if(state>-1){
		document.getElementById("drawMenu").children[0].style.backgroundColor=getColor(state);
	}
	if(state>rule.length*0.8||state===0||state===-1){
		if(darkMode){
			document.getElementById("drawMenu").children[0].style.color="#bbb";
		}else{
			document.getElementById("drawMenu").children[0].style.color="#000";
		}
	}else{
		if(darkMode){
			document.getElementById("drawMenu").children[0].style.color="#000";
		}else{
			document.getElementById("drawMenu").children[0].style.color="#bbb";
		}
	}

	replaceDropdownElement(target);
}

function deleteOption(target){
	let option=target.parentElement;
	if(option.nodeName==="BUTTON")option=option.parentElement;
	if(option!==option.parentElement.lastElementChild)option.remove();
	if("info" in option)delete option.info;
}

function selectAll(){
	if(GRID.head.value!==0){
		pasteArea.isActive=false;
		selectArea.isActive=true;
		setActionMenu();
		if(GRID.type===0){
			selectArea.top=(getTopBorder(GRID.head)??0)/2-0.5;
			selectArea.right=(getRightBorder(GRID.head)??0)/2+0.5;
			selectArea.bottom=(getBottomBorder(GRID.head)??0)/2+0.5;
			selectArea.left=(getLeftBorder(GRID.head)??0)/2-0.5;
		}else{
			selectArea.top=GRID.finiteArea.top;
			selectArea.right=GRID.finiteArea.right;
			selectArea.bottom=GRID.finiteArea.bottom;
			selectArea.left=GRID.finiteArea.left;
		}
		if(isPlaying===0)render();
	}
}

function findPattern(area,pattern){
	for(let i=0;i<area.length-pattern.length+1;i++){
		for(let j=0;j<area[0].length-pattern[0].length+1;j++){
			let foundDifference=false;
			for(let k=0;k<pattern.length;k++){
				for(let l=0;l<pattern[0].length;l++){
					if(pattern[k][l]!==area[i+k][j+l]){
						foundDifference=true;
						break;
					}
				}
				if(foundDifference)break;
			}
			if(foundDifference===false)return {x:i,y:j};
		}
	}
	return {x:-1,y:-1};
}

function copy(){
	if(pasteArea.isActive){
		resetClipboard();
	}else if(selectArea.isActive===true){
		GRID.head=widenTree(selectArea);
		clipboard[activeClipboard].pattern=readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left);
		clipboard[activeClipboard].previewBitmap=patternToBitmap(clipboard[activeClipboard].pattern);
		pasteArea.top=selectArea.top;
		pasteArea.left=selectArea.left;
		clipboard[activeClipboard].shipInfo={dx:null,dy:null,phases:[],period:0};
		selectArea.isActive=false;
		setActionMenu();
		// TODO: replace render() here
	}
}

function cut(){
	if(pasteArea.isActive){
		resetClipboard();
	}else if(selectArea.isActive===true){
		GRID.head=widenTree(selectArea);
		clipboard[activeClipboard].pattern=readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left);
		pasteArea.top=selectArea.top;
		pasteArea.left=selectArea.left;
		let clearedArray = new Array(selectArea.right-selectArea.left);
		for(let i=0; i< clearedArray.length; i++){
			clearedArray[i]=new Array(selectArea.bottom-selectArea.top);
			clearedArray[i].fill(0);
		}
		currentEvent=writePatternAndSave(selectArea.left,selectArea.top, clearedArray);
		if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
		isPlaying=0;
		selectArea.isActive=false;
		setActionMenu();
		// TODO: replace render() here
	}
}

function paste(){
	captureScroll=true;
	if(clipboard[activeClipboard]&&clipboard[activeClipboard].pattern.length!==0){
		if(pasteArea.isActive){
			currentEvent=writePatternAndSave(pasteArea.left,pasteArea.top,clipboard[activeClipboard].pattern);
			console.log(currentEvent);
			if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
		}else{
			selectArea.isActive=false;
			pasteArea.isActive=true;
			editMode=1;
			if(isPlaying===0)render();
		}
		setActionMenu();
	}
}

//fill the grid with random cell states
function randomizeGrid(area){
	let randomArray=new Array(area.right-area.left);
	for(let i=0;i<randomArray.length;i++){
		randomArray[i]=new Array(area.bottom-area.top);
		for(let j=0;j<randomArray[0].length;j++){
			if(Math.random()<document.getElementById("density").value/100){
				randomArray[i][j]=1;
			}else{
				randomArray[i][j]=0;
			}
		}
	}

	currentEvent=writePatternAndSave(area.left,area.top, randomArray);
	if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
	// TODO: replace render() here
}

//run the CA for one generation within the provided area
function incrementArea(area){
	let initalArray=readPattern(area.top-1,area.right+1,area.bottom+1,area.left-1);

	currentEvent=writePatternAndSave(area.left,area.top, iteratePattern(initalArray,1,initalArray.length-1,initalArray[0].length-1,1));
	if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
	// TODO: replace render() here
}

//clear the grid
function clearGrid(){
	if(selectArea.isActive===true){
		let clearedArray = new Array(selectArea.right-selectArea.left);
		for(let i=0; i< clearedArray.length; i++){
			clearedArray[i]=new Array(selectArea.bottom-selectArea.top);
			clearedArray[i].fill(0);
		}
		currentEvent=writePatternAndSave(selectArea.left,selectArea.top, clearedArray);
		if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
	}
	// TODO: replace render() here
}

//fill the grid with the opposite cell state, states 2+ are unchanged
function invertGrid(){
	if(pasteArea.isActive){
		resetClipboard();
	}else if(selectArea.isActive===true){
		GRID.head=widenTree(selectArea);
		let invertedArea=readPattern(selectArea.top,selectArea.right,selectArea.bottom,selectArea.left);

		for(let i=0; i<invertedArea.length; i++){
			for(let j=0; j<invertedArea[0].length; j++){
				if(invertedArea[i][j]===0||invertedArea[i][j]===1)invertedArea[i][j]=1-invertedArea[i][j];
			}
		}

		currentEvent=writePatternAndSave(selectArea.left,selectArea.top, invertedArea);
		if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
	}
	isPlaying=0;
	// TODO: replace render() here
}

//flip the pattern to be pasted
function flipDiag(){
	let newPattern=new Array(clipboard[activeClipboard].pattern[0].length);
	for(let i=0;i<newPattern.length;i++){
		newPattern[i]=new Array(clipboard[activeClipboard].pattern.length);
		for(let j=0;j<newPattern[0].length;j++){
			newPattern[i][j]=clipboard[activeClipboard].pattern[j][i];
		}
	}
	pasteArea.left-=Math.trunc(newPattern.length/2-newPattern[0].length/2);
	pasteArea.top +=Math.trunc(newPattern.length/2-newPattern[0].length/2);
	clipboard[activeClipboard].pattern=newPattern;
}

//flip the pattern to be pasted
function flipOrtho(direction="horizonal"){
	const patternWidth=clipboard[activeClipboard].pattern.length;
	let newPattern=new Array(clipboard[activeClipboard].pattern.length);
	for(let i=0;i<newPattern.length;i++){
		newPattern[i]=new Array(clipboard[activeClipboard].pattern[0].length);
		for(let j=0;j<newPattern[0].length;j++){
			if(direction==="horizonal"){
				newPattern[i][j]=clipboard[activeClipboard].pattern[clipboard[activeClipboard].pattern.length-1-i][j];
			}else{
				newPattern[i][j]=clipboard[activeClipboard].pattern[i][clipboard[activeClipboard].pattern[0].length-1-j];
			}
		}
	}
	clipboard[activeClipboard].pattern=newPattern;
	if(isPlaying===0)render();
}

function updateSelectors(){
	let dropdownContents=document.getElementsByClassName("dropdown-content");
	for(let i=0;i<dropdownContents.length;i++){
		let elementIndex=0;
		if(dropdownContents[i].className.includes("pattern-marker")
			||dropdownContents[i].className.includes("areas"))elementIndex++;

		if(dropdownContents[i].className.includes("areas")){
			for(let j=0;j<markers.length;j++){
				if(elementIndex>=dropdownContents[i].children.length){
					if(markers[j].activeState>0&&markers[j].pattern.length===0){
						dropdownContents[i].innerHTML+=`<button onclick="replaceDropdownElement(this);updateSelectors();">Marker ${j+1}</button>`;
						elementIndex++;
					}
				}else{
					const markerIndex=parseInt(dropdownContents[i].children[elementIndex].innerHTML.slice(7))-1;
					if(markers[j].activeState>0&&markers[j].pattern.length===0&&j!==markerIndex){
						dropdownContents[i].children[elementIndex-1].insertAdjacentHTML("afterend",`<button onclick="replaceDropdownElement(this);updateSelectors();">Marker ${j+1}</button>`);
						elementIndex++;
					}else if(markers[j].activeState>0&&markers[j].pattern.length===0&&j===markerIndex){
						elementIndex++;
					}else if((markers[j].activeState===0||markers[j].pattern.length===0)&&j===markerIndex){
						dropdownContents[i].children[elementIndex].remove();
					}
				}
			}
		}
		if(dropdownContents[i].className.includes("pattern-marker")){
			for(let j=0;j<markers.length;j++){
				if(elementIndex>=dropdownContents[i].children.length){
					if(markers[j].activeState>0&&markers[j].pattern.length!==0){
						dropdownContents[i].innerHTML+=`<button onclick="replaceDropdownElement(this);updateSelectors();">Marker ${j+1}</button>`;
						elementIndex++;
					}
				}else{
					const markerIndex=parseInt(dropdownContents[i].children[elementIndex].innerHTML.slice(7))-1;
					if(markers[j].activeState>0&&markers[j].pattern.length!==0&&j!==markerIndex){
						dropdownContents[i].children[elementIndex-1].insertAdjacentHTML("afterend",`<button onclick="replaceDropdownElement(this);updateSelectors();">Marker ${j+1}</button>`);
						elementIndex++;
					}else if(markers[j].activeState>0&&markers[j].pattern.length!==0&&j===markerIndex){
						elementIndex++;
					}else if((markers[j].activeState===0||markers[j].pattern.length!==0)&&j===markerIndex){
						dropdownContents[i].children[elementIndex].remove();
					}
				}
			}
			/*dropdownContents[i].innerHTML+='<button onclick="if(clipboard[activeClipboard].pattern&&pasteArea.isActive) analyzeShip(clipboard[activeClipboard],this.parentElement.parentElement.parentElement.info,pasteArea);changeOption(this);">Active Paste</button>';
			for(let j=0;j<markers.length;j++){
				if(markers[j].activeState&&markers[j].pattern.length!==0){
					dropdownContents[i].innerHTML+=`\n<button onclick="changeOption(this);">Marker ${j+1}</button>`;
				}
			}*/
		}
		if(dropdownContents[i].className.includes("copy-slot")){
			for(let j=1;j<clipboard.length-1;j++){
				if(elementIndex>=dropdownContents[i].children.length){
					dropdownContents[i].innerHTML+=`<button onclick="replaceDropdownElement(this);">Copy Slot ${j}</button>`;
					elementIndex++;
				}
			}
		}
	}
}

function deleteMarker(){
	for(let h = 0;h<markers.length;h++){
		if(markers[h].activeState===2){
			markers[h]={activeState:0,top:0,right:0,bottom:0,left:0,shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0},pattern:[]};
		}
	}
	updateSelectors();
	setActionMenu();
	// TODO: replace render() here
}

//set default view
function setMark(){
	if(pasteArea.isActive===true){
		for(let h=0;h<markers.length;h++){
			if(markers[h].activeState===0){
				pasteArea.isActive=false;
				setActionMenu();
				markers[h].activeState=1;
				markers[h].top=pasteArea.top;
				markers[h].right=pasteArea.left+clipboard[activeClipboard].pattern.length;
				markers[h].bottom=pasteArea.top+clipboard[activeClipboard].pattern[0].length;
				markers[h].left=pasteArea.left;
				markers[h].pattern=clipboard[activeClipboard].pattern;
				break;
			}
		}
		updateSelectors();
	}else if(selectArea.isActive===true){
		for(let h=0;h<markers.length;h++){
			if(markers[h].activeState===0){
				selectArea.isActive=false;
				setActionMenu();
				markers[h]={activeState:1, top:selectArea.top, right:selectArea.right, bottom:selectArea.bottom, left:selectArea.left,shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0}, pattern:[]};
				break;
			}
		}
		updateSelectors();
	}
	if(isPlaying===0)render();
}

function isElementCheckedById(id){
	return document.getElementById(id).checked;
}

function setDark(){
	if(document.getElementById("darkTheme").checked){
		darkMode=1;
		if(detailedCanvas===true){
			canvas.style.backgroundColor="#222";
		}else{
			canvas.style.backgroundColor="#2c2c2c";
		}
		document.getElementById("LightTheme").disabled =true;
		document.getElementById("DarkTheme").disabled =false;
	}else{
		darkMode=0;
		if(detailedCanvas===true){
			canvas.style.backgroundColor="#f1f1f1";
		}else{
			canvas.style.backgroundColor="#ddd";
		}
		document.getElementById("LightTheme").disabled =false;
		document.getElementById("DarkTheme").disabled =true;
	}
	setDrawMenu();
	// TODO: replace render() here
}

//move e frames forward
function next(){
	worker.postMessage({type:"next",args:[]});
}

//toggle updating the simulation
function start(){
	if(isPlaying===0){
		isPlaying=1;
		worker.postMessage({type:"start",args:[]});
	}else{
		isPlaying=0;
		worker.postMessage({type:"stop",args:[]});
	}
}

function setEvent(gridEvent){
	if(!("type" in gridEvent)){
		setEvent(gridEvent.parent);
		if("draw" in gridEvent){
			for(let i=0;i<gridEvent.draw.length;i++){
				writePattern(gridEvent.draw[i].x,gridEvent.draw[i].y,[[gridEvent.draw[i].newState]], GRID);
			}
			if(socket&&resetEvent===null)socket.emit("draw",Date.now(),gridEvent.draw);
		}else if("paste" in gridEvent){
			writePattern(...gridEvent.paste.newPatt, GRID);
			if(socket&&resetEvent===null)socket.emit("paste",Date.now(),gridEvent.paste);
		}
	}else{
		if("generation" in gridEvent){
			genCount=gridEvent.generation;
			document.getElementById("gens").innerHTML="Generation "+genCount;
		}
		if("backgroundState" in gridEvent)GRID.backgroundState=gridEvent.backgroundState;

		if("resetEvent" in gridEvent)resetEvent=gridEvent.resetEvent;

		//redundent, remove at some point if "type" is still used for events storing the entire grid
		if("type" in gridEvent){
			GRID.type=gridEvent.type;
			setMenu("gridMenu",GRID.type);
			
			emptyNodes=emptyNodes.map(()=>null);
			if(GRID.type===0){
				GRID.head=gridEvent.head;
				document.getElementById("population").innerHTML="Population "+GRID.head.population;
			}else{
				if(typeof(gridEvent.finiteArray)==="string"){
					GRID.finiteArray=parseRLE(gridEvent.finiteArray).pattern;
				}else{
					GRID.finiteArray=gridEvent.finiteArray;
				}
				GRID.finiteArea.top=gridEvent.finiteArea.top;
				GRID.finiteArea.right=gridEvent.finiteArea.left+GRID.finiteArray.length;
				GRID.finiteArea.bottom=gridEvent.finiteArea.top+GRID.finiteArray[0].length;
				GRID.finiteArea.left=gridEvent.finiteArea.left;
				GRID.finiteArea.margin=GRID.type===1?1:0;
			}
		}
	}
	currentEvent=gridEvent;
}

function undo(){
	if(currentEvent.parent!==null){
		if("draw" in currentEvent){
			for(let i=0;i<currentEvent.draw.length;i++){
				writePattern(currentEvent.draw[i].x,currentEvent.draw[i].y,[[currentEvent.draw[i].oldState]], GRID);
			}
			if(socket&&resetEvent===null)socket.emit("undoDraw",Date.now(),currentEvent.draw);
			currentEvent=currentEvent.parent;
		}else if("paste" in currentEvent){
			writePattern(...currentEvent.paste.oldPatt, GRID);
			
			if(socket&&resetEvent===null)socket.emit("undoPaste",Date.now(),currentEvent.paste);
			currentEvent=currentEvent.parent;
		}else{
			setEvent(currentEvent.parent);
		}
		//compare parents because the reset event may be a different event with identical values
		if(resetEvent!==null&&resetEvent.parent===currentEvent.parent)resetEvent=null;
	}
	isPlaying=0;
	// TODO: replace render() here
}

function redo(){
	if(currentEvent.child!==null){
		if("draw" in currentEvent.child){
			currentEvent=currentEvent.child;
			for(let i=0;i<currentEvent.draw.length;i++){
				writePattern(currentEvent.draw[i].x,currentEvent.draw[i].y,[[currentEvent.draw[i].newState]], GRID);
			}
			if(socket&&resetEvent===null)socket.emit("draw",Date.now(),currentEvent.draw);
		}else if("paste" in currentEvent.child){
			currentEvent=currentEvent.child;
			writePattern(...currentEvent.paste.newPatt, GRID);

			if(socket&&resetEvent===null)socket.emit("paste",Date.now(),currentEvent.paste);
		}else{
			setEvent(currentEvent.child);
		}
	}
	isPlaying=0;
	// TODO: replace render() here
}

function resetActions(){
	if(isElementCheckedById("userReset")===false)return;
	
	const conditionElements=document.getElementById("searchOptions").getElementsByClassName("condition");
	for(let i=0;i<conditionElements.length;i++){
		if(conditionElements[i].children[0]&&conditionElements[i].children[0].innerHTML==="Reset"){
			searchAction(conditionElements[i].parentElement);
			break;
		}
	}
	if(isPlaying===0)render();
}

function incrementSearch(searchData){
	if(searchData.progress.slice(-1)[0].delay.slice(-1)[0]===0){
		searchData.progress.push({delay:[0,searchData.repeatTime],repeatedResult:false,result:null});
		searchData.minIncrement=1;
		searchData.minAppend=1;
	}else{
		if(searchData.repeatTime<=searchData.progress[searchData.minIncrement].delay.slice(-1)[0]-searchData.progress[searchData.minAppend].delay.slice(-1)[0]){
			searchData.progress.push({delay:[...searchData.progress[searchData.minAppend].delay,searchData.progress[searchData.minAppend].delay.slice(-1)[0]+searchData.repeatTime],repeatedResult:true,result:null});
			searchData.minAppend++;
		}else{
			searchData.progress.push({delay:[...searchData.progress[searchData.minIncrement].delay],repeatedResult:false,result:null});
			searchData.progress.slice(-1)[0].delay[searchData.progress.slice(-1)[0].delay.length-1]++;
			searchData.minIncrement++;
		}
	}
}

function appendRLE(rleText){
	let currentText=document.getElementById("rle").value;
	//remove exclamation mark from the end of the current RLE
	currentText=currentText.replace("!","").replace(/x *= *[0-9]+, *y *= *[0-9]+,/,"x = 0, y = 0,");
	let i=currentText.length;
	while("\n"!==currentText[i]&&i>0)i--;
	i+=70;
	currentText+=document.getElementById("rleMargin").value+"$"+rleText.replace(/.+\n/,"").replace(/\n/g,"");
	while(i<currentText.length){
		while(!isNaN(currentText[i])&&i>0){
			i--;
		}
		currentText=currentText.slice(0,i+1)+"\n"+currentText.slice(i+1);
		i+=70;
	}
	return currentText;
}

function menu(n){
	if(document.getElementById(`menu${n.toString()}`).style.display==="block"){
		document.getElementById(`arrow${n.toString()}`).innerHTML="&#x27A1";//rightward unicode arrow
		document.getElementById(`menu${n.toString()}`).style.display="none";
	}else{
		document.getElementById(`arrow${n.toString()}`).innerHTML="&#x2B07";//downward unicode arrow
		document.getElementById(`menu${n.toString()}`).style.display="block";
	}
}

//import several settings
function save(){
	//save the rule
	//TODO: move to worker
	
	// if(document.getElementById("rule").value!==rulestring&&document.getElementById("rule").value!==""){
	// 	setRule(document.getElementById("rule").value);
	// 	if(socket)socket.emit("rule", rulestring);
	// 	isPlaying=0;
	// }
	// //save step size
	if(document.getElementById("step").value){
		if(isNaN(document.getElementById("step").value)){
			alert("Genertions Per Update must be a number");
		}else{
			worker.postMessage({type:"stepSize",args:[parseInt(document.getElementById("step").value,10)]});
		}
	}
	// TODO: replace render() here
}

function readSubpattern(pattern,top,right,bottom,left){
	let subpattern=new Array(right-left);
	for(let i=0;i<subpattern.length;i++){
		subpattern[i]=new Array(bottom-top);
		for(let j=0;j<subpattern[i].length;j++){
			subpattern[i][j]=pattern[i+left][j+top];
		}
	}
	return subpattern;
}
 
//TODO: rewrite for worker

// function writePatternAndSave(xPosition,yPosition,pattern){
// 	if(!pattern||pattern.length===0)return currentEvent;
// 	
// 	const previousPattern=readPattern(yPosition,xPosition+pattern.length,yPosition+pattern[0].length,xPosition,GRID);
// 	//if a grid other than the "main" grid is passed as a 4th argument
// 	if(GRID.type===0){
// 		//write to the provided infinte grid
// 		GRID.head=widenTree({top:yPosition,right:xPosition+pattern.length,bottom:yPosition+pattern[0].length,left:xPosition},GRID.head);
// 		GRID.head=writePatternToGrid(xPosition,yPosition, pattern, GRID.head);
// 	}else{
// 		//write to the provided finite grid
// 		let somethingChanged=false;
// 		/*for (let i = 0; i < pattern.length; i++) {
// 			for (let j = 0; j < pattern[0].length; j++) {
// 				if(j+yPosition>=finiteGridTop-finiteGridMargin&&i+xPosition<finiteGridLeft+finiteGrid.length-2+finiteGridMargin&&j+yPosition<finiteGridTop+finiteGrid[0].length-2+GRID.finiteArea.margin&&i+xPosition>=finiteGridLeft-finiteGridMargin){
// 					finiteGrid[i-finiteGridLeft+finiteGridMargin+xPosition][j-finiteGridTop+finiteGridMargin+yPosition]=pattern[i][j];
// 					somethingChanged=true;
// 				}
// 			}
// 		}*/
// 		for (let i = 0; i < pattern.length; i++) {
// 			for (let j = 0; j < pattern[0].length; j++) {
// 				if(j+yPosition>=GRID.finiteArea.top-GRID.finiteArea.margin&&i+xPosition<GRID.finiteArea.right+GRID.finiteArea.margin&&j+yPosition<GRID.finiteArea.bottom+GRID.finiteArea.margin&&i+xPosition>=GRID.finiteArea.left-GRID.finiteArea.margin){
// 					GRID.finiteArray[i-GRID.finiteArea.left+GRID.finiteArea.margin+xPosition][j-GRID.finiteArea.top+GRID.finiteArea.margin+yPosition]=pattern[i][j];
// 					somethingChanged=true;
// 				}
// 			}
// 		}
// 		if(somethingChanged===false)return currentEvent;
// 	}
// 	return new EventNode(currentEvent, Date.now(), "paste", {newPatt:[xPosition,yPosition,pattern], oldPatt:[xPosition,yPosition,previousPattern]});
// }
//
// function writePattern(xPosition,yPosition,pattern,objectWithGrid){
// 	//if the grid is infinite
// 	if(objectWithGrid.type!==0){
// 		//write to the finite grid
// 		for (let i = 0; i < pattern.length; i++) {
// 			for (let j = 0; j < pattern[0].length; j++) {
// 				if(j+yPosition>=objectWithGrid.finiteArea.top-objectWithGrid.finiteArea.margin&&i+xPosition<objectWithGrid.finiteArea.left+objectWithGrid.finiteArray.length-objectWithGrid.finiteArea.margin&&j+yPosition<objectWithGrid.finiteArea.top+objectWithGrid.finiteArray[0].length-objectWithGrid.finiteArea.margin&&i+xPosition>=objectWithGrid.finiteArea.left-objectWithGrid.finiteArea.margin){
// 					objectWithGrid.finiteArray[i-objectWithGrid.finiteArea.left+objectWithGrid.finiteArea.margin+xPosition][j-objectWithGrid.finiteArea.top+objectWithGrid.finiteArea.margin+yPosition]=pattern[i][j];
// 				}
// 			}
// 		}
// 	}else{
// 		//write to the infinte grid
// 		objectWithGrid.head=widenTree({top:yPosition,right:xPosition+pattern.length,bottom:yPosition+pattern[0].length,left:xPosition},objectWithGrid.head);
// 		objectWithGrid.head=writePatternToGrid(xPosition,yPosition, pattern, objectWithGrid.head);
// 	}
// }
//
// function getTopBorder(node){
// 	const ySign=[-1,-1,1,1];
// 	if(node.distance===1)return node.value!==0?0:null;
// 	
// 	let currentMin=null, cache;
// 	for(let i=0;i<4;i++){
// 		cache=getTopBorder(node.child[i]);
// 		if(cache!==null&&(currentMin===null||currentMin>(node.distance>>1)*ySign[i]+cache)){
// 			currentMin=(node.distance>>1)*ySign[i]+cache;
// 		}
// 	}
// 	return currentMin;
// }
//
// function getRightBorder(node){
// 	const xSign=[-1,1,-1,1];
// 	if(node.distance===1)return node.value!==0?0:null;
// 	
// 	let currentMax=null, cache;
// 	for(let i=0;i<4;i++){
// 		cache=getRightBorder(node.child[i]);
// 		if(cache!==null&&(currentMax===null||currentMax<(node.distance>>1)*xSign[i]+cache)){
// 			currentMax=(node.distance>>1)*xSign[i]+cache;
// 		}
// 	}
// 	return currentMax;
// }
//
// function getBottomBorder(node){
// 	const ySign=[-1,-1,1,1];
// 	if(node.distance===1)return node.value!==0?0:null;
// 	
// 	let currentMax=null, cache;
// 	for(let i=0;i<4;i++){
// 		cache=getBottomBorder(node.child[i]);
// 		if(cache!==null&&(currentMax===null||currentMax<(node.distance>>1)*ySign[i]+cache)){
// 			currentMax=(node.distance>>1)*ySign[i]+cache;
// 		}
// 	}
// 	return currentMax;
// }
//
// function getLeftBorder(node){
// 	const xSign=[-1,1,-1,1];
// 	if(node.distance===1)return node.value!==0?0:null;
// 	
// 	let currentMin=null, cache;
// 	for(let i=0;i<4;i++){
// 		cache=getLeftBorder(node.child[i]);
// 		if(cache!==null&&(currentMin===null||currentMin>(node.distance>>1)*xSign[i]+cache)){
// 			currentMin=(node.distance>>1)*xSign[i]+cache;
// 		}
// 	}
// 	return currentMin;
// }

function patternToBaseN(pattern){
	//(g) is the number of states in the rule
	//(result) accumulates the compressed pattern encoded as a base-n encoding, where n is the largest power of g <=52
	//(stack) is a base (g) number, which holds information about a vertical "block" of cells
	//each block contains the largest number of cells with <=64 total states(eg. 3 cells in g4b2s345)
	let result="", stack=0, g=rule.length;
	if(pattern.length===0)return result;
	const blockSize=(52).toString(g).length-1;
	const lookupTable="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	for(let i=0;i<pattern[0].length;i+=blockSize){
		for(let j=0;j<pattern.length;j++){
			for(let k=0;k<blockSize&&i+k<pattern[0].length;k++){
				//add the current cell state as the most significant digit in the stack
				stack+=pattern[j][i+k]*(g**k);
			}
			//append (stack) as a base64 digit
			result+=lookupTable[stack];
			stack=0;
		}
	}
	return result;
}

function baseNToPattern(width,height,compressedString){
	//(pattern) is an empty (width) by (height) 2d array which will store the uncompressed pattern
	//(g) is the number of states in the rule
	//(stack) is a base (g) number, which holds information about a vertical "block" of cells
	//each block contains the largest number of cells with <=64 total states(eg. 3 cells in g4b2s345)
	//
	let pattern=new Array(width), stack=0, g=rule.length, strIndex=0;
	for(let i=0;i<width;i++){
		pattern[i]=new Array(height);
	}
	const blockSize=(52).toString(g).length-1;
	for(let i=0;i<height;i+=blockSize){
		for(let j=0;j<width;j++){
			if(strIndex>=compressedString.length){
				console.log("baseN parseing error: string too long for dimensions");
				return pattern;
			}
			stack="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(compressedString[strIndex]);
			strIndex++;
			for(let k=0;k<blockSize&&i+k<height;k++){
				pattern[j][i+k]=stack%g;
				stack=Math.floor(stack/g);
			}
		}
	}
	return pattern;
}

function LZ77ToBaseN(string){
	let result="",number=0,offset=0;
	for(let i=0;i<string.length&&i<maxDepth;i++){
		//write any letters directly to the result
		if(isNaN(string[i])){
			if(string[i]!=="~")result+=string[i];
		}else{
			//add digits to the number buffer
			number=10*number+parseInt(string[i]);
			//if the number is finished
			if(isNaN(string[i+1])){
				//use the number as the offset if there is a hyphen
				if(string[i+1]==="~"){
					offset=number;
				//use the number to count out the repeated letters otherwise
				}else{
					for(let j=0;j<number;j++){
						result+=result[result.length-offset-1];
					}
					offset=0;
				}
				number=0;
			}
		}
	}
	return result;
}

function baseNToLZ77(string){
	let result="";
	for(let i=0;i<string.length;i++){
		let offset=0,repeat=1;
		for(let j=0;j<i+1;j++){
			//search the previous j characters
			let stack=string.slice(i-j,i+1);
			for(let k=0;;k++){
				//find as how far the previous j characters repeat
				if(i+k+1>=string.length||stack[k%stack.length]!==string[i+k+1]){
					if(k>repeat&&k>j){
						offset=j;
						repeat=k;
					}
					break;
				}
			}
		}
		result+=string[i];
		if(repeat>1&&offset===0||repeat>repeat.toString().length+offset.toString().length+1){
			if(offset!==0)
				result+=`${offset}~`;
			result+=`${repeat}`;
			i+=repeat;
		}
	}
	return result;
}

function exportRulestring(){
	if(document.getElementById("BSG").checked){
		if(rule.length===2){
			return clean(rulestring).replace(/g[0-9]*/g,"");
		}else{
			return clean(rulestring);
		}
	}
	if(document.getElementById("gbs").checked){
		if(rule.length===2){
			return clean(rulestring).replace(/B([0-8aceijknqrtwyz-]*)\/S([0-8aceijknqrtwyz-]*)\/G([0-9]*)/g,"b$1s$2");
		}else{
			return clean(rulestring).replace(/B([0-8aceijknqrtwyz-]*)\/S([0-8aceijknqrtwyz-]*)\/G([0-9]*)/g,"g$3b$1s$2");
		}
	}
	if(document.getElementById("sbg").checked){
		if(rule.length===2){
			return clean(rulestring).replace(/B([0-8aceijknqrtwyz-]*)\/S([0-8aceijknqrtwyz-]*)\/G([0-9]*)/g,"$2/$1");
		}else{
			return clean(rulestring).replace(/B([0-8aceijknqrtwyz-]*)\/S([0-8aceijknqrtwyz-]*)\/G([0-9]*)/g,"$2/$1/$3");
		}
	}
	return rulestring;
}

//TODO: move to worker

// function patternToRLE(pattern){
// 	if(pattern.length===0)return `x = 0, y = 0, rule = ${exportRulestring()}\n!`;
// 	let RLE=`x = ${pattern.length}, y = ${pattern[0].length}, rule = ${exportRulestring()}`, numberOfAdjacentLetters=0;
// 	if(GRID.type===1)RLE+=`:P${pattern.length},${pattern[0].length}`;
// 	if(GRID.type===2)RLE+=`:T${pattern.length},${pattern[0].length}`;
// 	RLE+="\n";
// 	for(let j=0;j<pattern[0].length;j++){
// 		let endOfLine=0;
// 		for(let i=pattern.length-1;i>=0;i--){
// 			if(pattern[i][j]!==0){
// 				if(numberOfAdjacentLetters>1)RLE+=numberOfAdjacentLetters;
// 				endOfLine=i+1;
// 				break;
// 			}
// 		}
// 		if(endOfLine===0){
// 			numberOfAdjacentLetters++;
// 		}else{
// 			if(numberOfAdjacentLetters!==0){
// 				RLE+="$";
// 				numberOfAdjacentLetters=0;
// 			}
// 			for(let i=0;i<endOfLine;i++){
// 				numberOfAdjacentLetters++;
// 				if(i===endOfLine-1||pattern[i][j]!==pattern[i+1][j]){
// 					if(numberOfAdjacentLetters>1){
// 						RLE+=numberOfAdjacentLetters;
// 					}
// 					if(rule.length===2&&!/.+(Super)|(History)$/g.test(rulestring)){
// 						if(pattern[i][j]===0){
// 							RLE+="b";
// 						}else{
// 							RLE+="o";
// 						}
// 					}else{
// 						if(pattern[i][j]===0){
// 							RLE+=".";
// 						}else{
// 							RLE+=String.fromCharCode(64+pattern[i][j]);
// 						}
// 					}
// 					numberOfAdjacentLetters=0;
// 				}
// 			}
// 			numberOfAdjacentLetters=1;
// 		}
// 	}
//
// 	//adds a line break at least every 70 chars
// 	//avoids splitting numbers
// 	RLE=RLE.split("");
// 	let lineLength=0;
// 	for(let i=0;i<RLE.length;i++){
// 		//skip the header line
// 		if(i===0)while(RLE[i]!=="\n"&&i<RLE.length)i++;
// 		lineLength++;
// 		if(RLE[i]==="\n")lineLength=0;
// 		if(lineLength>70){
// 			for(let j=0;j<70;j++){
// 				if(isNaN(RLE[i-j-1])){
// 					RLE.splice(i-j,0,"\n");
// 					lineLength=j;
// 					break;
// 				}
// 			}
// 		}
// 	}
// 	return RLE.join("")+"!";
// }

function zoom(deltaZoom, xFocus=0.5*canvasWidth, yFocus=0.5*canvasHeight, pastViewX=view.x, pastViewY=view.y, pastViewZ=view.z) {
	view.z=pastViewZ * deltaZoom;
	view.x=pastViewX + (xFocus-0.5*canvasWidth)*(deltaZoom-1)/(deltaZoom)/cellWidth/pastViewZ;
	view.y=pastViewY + (yFocus-0.5*canvasHeight)*(deltaZoom-1)/(deltaZoom)/cellWidth/pastViewZ;
	if(socket&&resetEvent===null)socket.emit("zoom", {id:clientId, zoom:view.z});

	updateLines();
}

//turn off lines if zoomed out significantly
//then change canvas tone to match
function updateLines(){
	if(view.z<0.2&&detailedCanvas===true){
		detailedCanvas=false;
		if(darkMode){
			canvas.style.backgroundColor="#2c2c2c";
		}else{
			canvas.style.backgroundColor="#ddd";
		}
	}else if(view.z>0.2&&detailedCanvas===false){
		detailedCanvas=true;
		if(darkMode){
			canvas.style.backgroundColor="#222";
		}else{
			canvas.style.backgroundColor="#f1f1f1";
		}
	}
}


function update(){
	//if in write mode
	if(editMode===0){
		//TODO: rewrite for worker
		
		//if in move mode
	}else if(editMode===1){
		//if 2 fingers are touching the canvas
		if(pointers.length>=2){
			//scale the grid
			let pastSpacing = distance(pointers[0].dragX-pointers[1].dragX,pointers[0].dragY-pointers[1].dragY);
			let currentSpacing = distance(pointers[0].X-pointers[1].X,pointers[0].Y-pointers[1].Y);
			zoom(currentSpacing/pastSpacing, 0.5*(pointers[0].dragX+pointers[1].dragX), 0.5*(pointers[0].dragY+pointers[1].dragY), view.touchX,view.touchY,view.touchZ);
		}else{
			switch(edgeBeingDragged){
			case 0:
				if(pasteArea.isActive&&clipboard[activeClipboard]&&x>=pasteArea.left&&x<pasteArea.left+clipboard[activeClipboard].pattern.length&&y>=pasteArea.top&&y<pasteArea.top+clipboard[activeClipboard].pattern[0].length){
					edgeBeingDragged=5;
					pasteArea.pointerRelativeX=x-pasteArea.left;
					pasteArea.pointerRelativeY=y-pasteArea.top;
				}else if(GRID.type!==0&&
					 x>=GRID.finiteArea.left-1-Math.max(0,4/view.z+GRID.finiteArea.left-GRID.finiteArea.right)&&
					 x<GRID.finiteArea.right+1+Math.max(0,4/view.z+GRID.finiteArea.left-GRID.finiteArea.right)&&
					 y>=GRID.finiteArea.top-1-Math.max(0,4/view.z+GRID.finiteArea.top-GRID.finiteArea.bottom)&&
					 y<GRID.finiteArea.bottom+1+Math.max(0,4/view.z+GRID.finiteArea.top-GRID.finiteArea.bottom)){
					//select the grid edges if necessary
					if(x<Math.min(GRID.finiteArea.left+4/view.z,(GRID.finiteArea.right+GRID.finiteArea.left)/2)){
						edgeBeingDragged=3;
						isPlaying=0;
					}else if(x>Math.max(GRID.finiteArea.right-4/view.z,(GRID.finiteArea.right+GRID.finiteArea.left)/2)){
						edgeBeingDragged=1;
						isPlaying=0;
					}
					if(y<Math.min(GRID.finiteArea.top+4/view.z,(GRID.finiteArea.bottom+GRID.finiteArea.top)/2)){
						edgeBeingDragged=4;
						isPlaying=0;
					}else if(y>Math.max(GRID.finiteArea.bottom-4/view.z,(GRID.finiteArea.bottom+GRID.finiteArea.top)/2)){
						edgeBeingDragged=2;
						isPlaying=0;
					}
				}else{
					//translate the grid
					view.x=view.touchX+(pointers[0].deltaX)/cellWidth/view.z;
					view.y=view.touchY+(pointers[0].deltaY)/cellWidth/view.z;
					if(socket&&resetEvent===null)socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
				}
				break;
				//drag left edge
			case 3:
				//drag the left edge
				if(x<GRID.finiteArea.right){
					GRID.finiteArea.newLeft=x;
					GRID.finiteArea.newRight=GRID.finiteArea.right;
				}else{
					GRID.finiteArea.newLeft=GRID.finiteArea.right;
					GRID.finiteArea.newRight=x+1;
				}
				//draw rect across the left
				break;
				//drag right edge
			case 1:
				//drag the right egde
				if(x<GRID.finiteArea.left){
					GRID.finiteArea.newLeft=x;
					GRID.finiteArea.newRight=GRID.finiteArea.left;
				}else{
					GRID.finiteArea.newLeft=GRID.finiteArea.left;
					GRID.finiteArea.newRight=x+1;
				}
				//draw rect across the right
				break;
				//drag upper edge
			case 2:
				//drag the top edge
				if(y<GRID.finiteArea.top){
					GRID.finiteArea.newTop=y;
					GRID.finiteArea.newBottom=GRID.finiteArea.top;
				}else{
					GRID.finiteArea.newTop=GRID.finiteArea.top;
					GRID.finiteArea.newBottom=y+1;
				}
				//draw rect across the top
				break;
				//drag downward edge
			case 4:
				//drag the bottom edge
				if(y<GRID.finiteArea.bottom){
					GRID.finiteArea.newTop=y;
					GRID.finiteArea.newBottom=GRID.finiteArea.bottom;
				}else{
					GRID.finiteArea.newTop=GRID.finiteArea.bottom;
					GRID.finiteArea.newBottom=y+1;
				}
				//draw rect across the bottom
				break;
			case 5:
				pasteArea.left=x-pasteArea.pointerRelativeX;
				pasteArea.top=y-pasteArea.pointerRelativeY;
				break;
			}
		}
		//if in select mode
	}else if(editMode===2){
		// Select an edge of the selectArea if the cursor is within the area
		// The marigin for selecting is increased on the left and right if
		// the area is narrower than 4/view.z, and likewise for the
		// top and bottom.
		if(selectArea.isActive===true&&edgeBeingDragged===0&&x>=selectArea.left-1-Math.max(0,4/view.z+selectArea.left-selectArea.right)&&x<selectArea.right+1+Math.max(0,4/view.z+selectArea.left-selectArea.right)&&y>=selectArea.top-1-Math.max(0,4/view.z+selectArea.top-selectArea.bottom)&&y<selectArea.bottom+1+Math.max(0,4/view.z+selectArea.top-selectArea.bottom)){
			// The margin for selecting the edges within the selectArea
			// is 4/view.z wide, but also less than the half the width
			//
			// edgeBeingDragged:
			//-4 = bottom -left edge
			//-3 = left edge
			//-2 = top-left edge
			//-1 = bottom edge
			// 0 = no edge is selected
			// 1 = top edge
			// 2 = bottom-right edge
			// 3 = bottom edge
			// 4 = top-right edge
			//
			//     +1
			//      ^
			// -3 < 0 > +3
			//      v
			//     -1
			if(x<Math.min(selectArea.left+4/view.z,(selectArea.right+selectArea.left)/2)){
				edgeBeingDragged=-3;
				isPlaying=0;
			}else if(x>Math.max(selectArea.right-4/view.z,(selectArea.right+selectArea.left)/2)){
				edgeBeingDragged=3;
				isPlaying=0;
			}
			if(y<Math.min(selectArea.top+4/view.z,(selectArea.bottom+selectArea.top)/2)){
				edgeBeingDragged+=1;
				isPlaying=0;
			}else if(y>Math.max(selectArea.bottom-4/view.z,(selectArea.bottom+selectArea.top)/2)){
				edgeBeingDragged-=1;
				isPlaying=0;
			}
			//deselect all markers
			for(let h=0;h<markers.length;h++){
				if(markers[h].activeState===2)markers[h].activeState=1;
			}
		}else if(selectArea.isActive===true&edgeBeingDragged!==0){
			//drag bottom edge
			if(mod(edgeBeingDragged,3)===2){
				selectArea.bottom=y+1;
				if(y<selectArea.top){
					selectArea.bottom=selectArea.top+1;
					edgeBeingDragged+=2;
				}
				if(edgeBeingDragged===-1){
					if(x<selectArea.left)edgeBeingDragged=-4;
					if(x>selectArea.right)edgeBeingDragged=2;
				}
			}
			//drag left edge
			if(edgeBeingDragged>=-4&&edgeBeingDragged<=-2){
				selectArea.left=x;
				if(x>=selectArea.right-1){
					selectArea.left=selectArea.right-1;
					edgeBeingDragged+=6;
				}
				if(edgeBeingDragged===-3){
					if(y<selectArea.top)edgeBeingDragged=-2;
					if(y>selectArea.bottom)edgeBeingDragged=-4;
				}
			}
			//drag top edge
			if(mod(edgeBeingDragged,3)===1){
				selectArea.top=y;
				if(y>=selectArea.bottom-1){
					selectArea.top=selectArea.bottom-1;
					edgeBeingDragged-=2;
				}
				if(edgeBeingDragged===1){
					if(x<selectArea.left)edgeBeingDragged=-2;
					if(x>selectArea.right)edgeBeingDragged=4;
				}
			}
			//drag right edge
			if(edgeBeingDragged>=2&&edgeBeingDragged<=4){
				selectArea.right=x+1;
				if(x<selectArea.left+1){
					selectArea.right=selectArea.left+1;
					edgeBeingDragged-=6;
				}
				if(edgeBeingDragged===3){
					if(y<selectArea.top)edgeBeingDragged=4;
					if(y>selectArea.bottom)edgeBeingDragged=2;
				}
			}
		}else{
			//marker[#].activeState:
			//0 = inactive, not visible,
			//1 = active, visible
			//2 = selected, visible with strong outline
			//selectedMarker:
			//-2 = no marker is selected
			//-1 = a marker is selected
			//n>=0 = marker[n] is selected
			if(selectedMarker===-1){
				//if no 
				for(let h=0;h<markers.length;h++){
					if(markers[h].activeState===2){
						//if the loop reaches a selected marker, deselect it
						//and select the most recent indexed marker within
						//the click area
						markers[h].activeState=1;
						if(selectedMarker>=0)markers[selectedMarker].activeState=2;
						if(selectedMarker!==-1){
							selectedMarker=-2;
							break;
						}
					}else if(markers[h].activeState===1&&x>=markers[h].left&&x<markers[h].right&&y>=markers[h].top&&y<markers[h].bottom){
						// if the current marker is active, unselected, and
						// being clicked, then mark it for being selected
						// later
						selectedMarker=h;
					}
				}
			}
			// if all markers have been looped through without being selected
			// select the last indexed marker
			if(selectedMarker!==-1){
				if(selectedMarker>=0)markers[selectedMarker].activeState=2;
				console.log(`${markers[0].activeState} ${markers[1].activeState} ${markers[2].activeState} ${markers[3].activeState}`);
				setActionMenu();
			}else if(selectArea.isActive===false){
				// make a selectArea if there are no selectable markers
				// this happens when the cursor clicks in an empty area.
				selectArea.isActive=true;
				setActionMenu();
				edgeBeingDragged=0;
				selectArea.left=x;
				selectArea.top=y;
				selectArea.right=x+1;
				selectArea.bottom=y+1;
			}
		}
	}
}

//TODO: rewrite for worker
//
//
//
// function getScreenXPosition(coordinate){
// 	return canvasWidth*0.5-((view.x-coordinate)*cellWidth+canvasWidth*0.5)*view.z;
// }
//
// function getScreenYPosition(coordinate){
// 	return canvasHeight*0.5-((view.y-coordinate)*cellWidth+canvasHeight*0.5)*view.z;
// }

//function which recursively draws squares within the quadtree
// function drawSquare(node,xPos,yPos){
// 	const xSign=[-1,1,-1,1];
// 	const ySign=[-1,-1,1,1];
// 	if(getScreenXPosition((xPos-node.distance)/2)>canvasWidth)return;
// 	if(getScreenYPosition((yPos+node.distance)/2)<0)return;
// 	if(getScreenXPosition((xPos+node.distance)/2)<0)return;
// 	if(getScreenYPosition((yPos-node.distance)/2)>canvasHeight)return;
// 	if(node.value===null){
// 		for(let i = 0;i < 4;i++){
// 			//check if the node is empty or has a null child
// 			if(node.value!==(document.getElementById("antiStrobing").checked?GRID.backgroundState:0)&&node.child[i]!==null){
// 				drawSquare(node.child[i],xPos+node.child[i].distance*xSign[i],yPos+node.child[i].distance*ySign[i]);
// 				if(isElementCheckedById("debugVisuals")===true&&node.value===null){
// 					ctx.strokeStyle="rgba(240,240,240,0.7)";
// 					ctx.beginPath();
// 					ctx.moveTo(getScreenXPosition(xPos/2),getScreenYPosition(yPos/2),view.z*cellWidth,view.z*cellWidth);
// 					ctx.lineTo(getScreenXPosition((xPos+xSign[i]*node.child[i].distance)/2),getScreenYPosition((yPos+ySign[i]*node.child[i].distance)/2),view.z*cellWidth,view.z*cellWidth);
// 					ctx.lineWidth=view.z;
// 					ctx.stroke();
// 				}
// 			}
// 		}
// 	}else{
// 		if(node.value!==(document.getElementById("antiStrobing").checked?GRID.backgroundState:0)){
// 			ctx.fillStyle=getColor(node.value);
// 			ctx.fillRect(getScreenXPosition((xPos-node.distance)/2),getScreenYPosition((yPos-node.distance)/2),view.z*cellWidth*node.distance,view.z*cellWidth*node.distance);
// 			//ctx.fillRect(canvasWidth*0.5-((view.x-(xPos-1)/2)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-(yPos-1)/2)*cellWidth+canvasHeight*0.5)*view.z,view.z*cellWidth,view.z*cellWidth);
// 		}
// 	}
// 	if(isElementCheckedById("debugVisuals")===true&&node.distance<2048){
// 		if(node.depth===null){
// 			ctx.strokeStyle="#FF0000";
// 		}else{
// 			ctx.strokeStyle=`#${(Math.floor((Math.abs(Math.sin(3+node.depth*5+(node.key*7%hashTable.length)) * 16777215))).toString(16))}`;
// 		
// 		ctx.lineWidth=view.z*4/node.distance.toString(2).length;
// 		ctx.strokeRect(canvasWidth*0.5-((view.x-(xPos-node.distance)*0.5)*cellWidth+canvasWidth*0.5-2/node.distance)*view.z,canvasHeight*0.5-((view.y-(yPos-node.distance)*0.5)*cellWidth+canvasHeight*0.5-2/node.distance)*view.z,(node.distance*cellWidth-4/node.distance)*view.z,(node.distance*cellWidth-4/node.distance)*view.z);
// 	}
// }

//function which renders graphics to the canvas
function renderPattern(pattern){
	let x=(view.x-30/view.z)%1, y=(view.y-20/view.z)%1, color=0, scaledCellWidth=cellWidth*view.z;
	let backgroundState = 0;

	//clear screen
	ctx.clearRect(0,0,canvasWidth,canvasHeight);

	if(darkMode){
		ctx.fillStyle="#fff";
	}else{
		ctx.fillStyle="#000";
	}
	
	//draw for the pattern
	for(let i = 0; i < pattern.length; i++){
		for (let j = 0; j < pattern[0].length; j++) {
			if(backgroundState!==pattern[i][j]){
				ctx.fillStyle=getColor(pattern[i][j]);
				ctx.fillRect((i-x)*scaledCellWidth,(j-y)*scaledCellWidth,scaledCellWidth,view.z*cellWidth);
			}
		}
	}

	render();
}

//function which renders graphics to the canvas
function render(){
	let x=view.x%1, y=view.y%1, color=0, scaledCellWidth=cellWidth*view.z;

	ctx.font = "20px Arial";

	if(isElementCheckedById("debugVisuals")===true){
		ctx.fillText(`view: ${Math.round(view.x * 100)*0.01} ${Math.round(view.touchX)} ${Math.round(view.y*100)*0.01} ${Math.round(view.touchY)}`,10,15);
		ctx.fillText(`${countRenders} renders`,10,30);
		//ctx.fillText(`${depthTotal/depthCount} hashnode depth`,10,45);
		ctx.fillText(`${ruleMetadata.size} rule nodes depth`,10,60);
		for (let i = 0; i < pointers.length; i++) {
			ctx.fillText(`cursor position: ${pointers[i].X} ${pointers[i].Y}`,10,75+15*i);
		}
		/*let indexedEvent=currentEvent;
		for(let i=0;i<maxDepth;i++){
			ctx.fillText(indexedEvent.action,500,20+20*i);
			indexedEvent=indexedEvent.parent;
			if(indexedEvent==null)break;
		}*/
		// for(let i=1;i<hashTableDepths.length;i++){
		// 	if(hashTableDepths[i]&&hashTableDepths[i]){
		// 		ctx.fillRect(10*i,40,10,2*(hashTableDepths[i]).toString(2).length);
		// 	}
		// }
	}

	//draw selected area
	if(selectArea.isActive===true){
		if(editMode===2&&edgeBeingDragged!==0){
			if(darkMode){
				ctx.fillStyle="#333";
			}else{
				ctx.fillStyle="#999";
			}
		}else{
			if(darkMode){
				ctx.fillStyle="#292929";
			}else{
				ctx.fillStyle="#ccc";
			}
		}
		ctx.fillRect(canvasWidth*0.5-((view.x-selectArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-selectArea.top)*cellWidth+canvasHeight*0.5)*view.z,(selectArea.right-selectArea.left)*scaledCellWidth-1,(selectArea.bottom-selectArea.top)*scaledCellWidth-1);
	}

	//draw paste
	if(pasteArea.isActive&&clipboard[activeClipboard].pattern[0]){
		if(editMode===2&&edgeBeingDragged!==0){
			if(darkMode){
				ctx.fillStyle="#555";
			}else{
				ctx.fillStyle="#999";
			}
		}else{
			if(darkMode){
				ctx.fillStyle="#333";
			}else{
				ctx.fillStyle="#ccc";
			}
		}
		ctx.fillRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,clipboard[activeClipboard].pattern.length*scaledCellWidth-1,clipboard[activeClipboard].pattern[0].length*scaledCellWidth-1);
	}

	//draw the various cells
	if(GRID.type===0){
		//draw for the infinite grid
		//TODO: have grid be rendered onmessage from worker
		//drawSquare(GRID.head,0,0);
	}else{
		//draw for the finite grids
		for(let i = 0; i < GRID.finiteArray.length-2*GRID.finiteArea.margin; i++){
			for (let j = 0; j < GRID.finiteArray[0].length-2*GRID.finiteArea.margin; j++) {
				if(GRID.backgroundState!==GRID.finiteArray[i+GRID.finiteArea.margin][j+GRID.finiteArea.margin]){
					ctx.fillStyle=getColor(GRID.finiteArray[i+GRID.finiteArea.margin][j+GRID.finiteArea.margin]);
					ctx.fillRect(canvasWidth*0.5-((view.x-(GRID.finiteArea.left+i))*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-(GRID.finiteArea.top+j))*cellWidth+canvasHeight*0.5)*view.z,view.z*cellWidth,view.z*cellWidth);
				}
			}
		}
	}

	ctx.globalAlpha=0.8;
	if(pasteArea.isActive&&clipboard[activeClipboard]&&clipboard[activeClipboard].pattern.length){
		for(let h=0;h<clipboard[activeClipboard].pattern.length;h++){
			for(let i=0;i<clipboard[activeClipboard].pattern[0].length;i++){
				if(clipboard[activeClipboard].pattern[h][i]>0){
					//set the color
					ctx.fillStyle=getColor(clipboard[activeClipboard].pattern[h][i]);
					ctx.fillRect(canvasWidth*0.5-(canvasWidth*0.5+view.x*cellWidth)*view.z+(pasteArea.left+h)*scaledCellWidth,canvasHeight*0.5-(canvasHeight*0.5+view.y*cellWidth)*view.z+(pasteArea.top+i)*scaledCellWidth,scaledCellWidth,scaledCellWidth);
				}
			}
		}
	}
	
	for(let i=0;i<markers.length;i++)if(markers[i].pattern&&markers[i].activeState!==0){
		for(let h=0;h<markers[i].pattern.length;h++){
			for(let j=0;j<markers[i].pattern[0].length;j++){
				if(markers[i].pattern[h][j]>0){
					ctx.fillStyle=getColor(markers[i].pattern[h][j]);
					ctx.fillRect(canvasWidth*0.5-(canvasWidth*0.5+view.x*cellWidth)*view.z+(markers[i].left+h)*scaledCellWidth,canvasHeight*0.5-(canvasHeight*0.5+view.y*cellWidth)*view.z+(markers[i].top+j)*scaledCellWidth,scaledCellWidth,scaledCellWidth);
				}
			}
		}
	}
	ctx.globalAlpha=1;
	//if the toggle grid variable is true
	if(isElementCheckedById("gridLines")===true){
		//draw a grid
		if(darkMode){
			ctx.strokeStyle="#999";
		}else{
			ctx.strokeStyle="#000000";
		}
		if(detailedCanvas===true){
			ctx.lineWidth=0.5*view.z;
			ctx.beginPath();
			//draw horizonal lines
			for(let h= -Math.ceil(canvasWidth*0.5/scaledCellWidth);h<canvasWidth*0.5/scaledCellWidth+1;h++){
				ctx.moveTo(canvasWidth*0.5+(h-x)*scaledCellWidth,0);
				ctx.lineTo(canvasWidth*0.5+(h-x)*scaledCellWidth,canvasHeight);
			}
			//draw virtical lines
			for(let h= -Math.ceil(canvasHeight*0.5/scaledCellWidth);h<canvasHeight*0.5/scaledCellWidth+1;h++){
				ctx.moveTo(0  ,canvasHeight*0.5+(h-y)*scaledCellWidth);
				ctx.lineTo(canvasWidth,canvasHeight*0.5+(h-y)*scaledCellWidth);
			}
			ctx.stroke();
		}
	}
	//draw a rectangle around each marker
	for(let h=0;h<2;h++){
		for(let i=0;i<markers.length;i++){
			if(markers[i].activeState!==0){
				if(markers[i].activeState===1){
					if(darkMode){
						ctx.strokeStyle="#888";
					}else{
						ctx.strokeStyle="#999";
					}
				}else if(markers[i].activeState===2){
					if(darkMode){
						ctx.strokeStyle="#bbb";
						ctx.fillStyle="#bbb";
					}else{
						ctx.strokeStyle="#999";
						ctx.fillStyle="#999";
					}
					ctx.lineWidth=1;
					ctx.fillText((i+1),canvasWidth*0.5+1*view.z-((view.x-markers[i].left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-6*view.z-((view.y-markers[i].top)*cellWidth+canvasHeight*0.5)*view.z,(markers[i].right-markers[i].left)*scaledCellWidth-1);
				}
				ctx.lineWidth=5*view.z;
				if((h===0&&markers[i].activeState===1)||(h===1&&markers[i].activeState===2)){
					ctx.strokeRect(canvasWidth*0.5-((view.x-markers[i].left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-markers[i].top)*cellWidth+canvasHeight*0.5)*view.z,(markers[i].right-markers[i].left)*scaledCellWidth-1,(markers[i].bottom-markers[i].top)*scaledCellWidth-1);
				}
			}
		}
	}
	//draw a rectangle around the right-selectArea.
	if(selectArea.isActive===true){
		ctx.lineWidth=3*view.z;
		ctx.strokeStyle="#666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-selectArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-selectArea.top)*cellWidth+canvasHeight*0.5)*view.z,(selectArea.right-selectArea.left)*scaledCellWidth-1,(selectArea.bottom-selectArea.top)*scaledCellWidth-1);
	}
	//draw a rectangle around the pattern to be pasted.
	if(pasteArea.isActive&&clipboard[activeClipboard].pattern[0]){
		ctx.lineWidth=3*view.z;
		ctx.strokeStyle="#666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,clipboard[activeClipboard].pattern.length*scaledCellWidth-1,clipboard[activeClipboard].pattern[0].length*scaledCellWidth-1);
	}

	//draw the border of the finite grids
	if(GRID.type!==0){
		ctx.lineWidth=8*view.z;
		if(darkMode){
			ctx.strokeStyle="#888";
		}else{
			ctx.strokeStyle="#999";
		}
		ctx.strokeRect(canvasWidth*0.5-((view.x-GRID.finiteArea.newLeft)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-GRID.finiteArea.newTop)*cellWidth+canvasHeight*0.5)*view.z,(GRID.finiteArea.newRight-GRID.finiteArea.newLeft)*scaledCellWidth-1,(GRID.finiteArea.newBottom-GRID.finiteArea.newTop)*scaledCellWidth-1);
	}

	//draw the view of the other clients
	for(let client in clientList){
		ctx.strokeStyle=`hsla(${clientList[client].color[0]},100%,80%,1)`;
		ctx.lineWidth=4;
		ctx.strokeRect(canvasWidth*0.5-((view.x-clientList[client].xPosition+15/clientList[client].zoom)*cellWidth)*view.z,canvasHeight*0.5-((view.y-clientList[client].yPosition+10/clientList[client].zoom)*cellWidth)*view.z,canvasWidth*view.z/clientList[client].zoom,canvasHeight*view.z/clientList[client].zoom);
		ctx.fillStyle=ctx.strokeStyle;
		ctx.font = "30px Arial";
		ctx.fillText(client,canvasWidth*0.5-((view.x-clientList[client].xPosition+15/clientList[client].zoom)*cellWidth)*view.z,180-((view.y-clientList[client].yPosition+10/clientList[client].zoom)*cellWidth)*view.z);
	}
}

function scaleCanvas(){
	windowWidth=window.innerWidth || document.documentElement.clientWidth;
	windowHeight=window.innerHeight || document.documentElement.clientHeight;
	if(windowWidth-20<windowHeight*1.2){
		canvasHeight=(windowWidth-20)/1.5;
		canvasWidth=windowWidth-20;
	}else{
		canvasHeight=windowHeight*0.8;
		canvasWidth=windowHeight*1.2;
	}
	if(windowWidth-canvasWidth>300){
		document.getElementById("top").style.width=`${windowWidth-canvasWidth-30}px`;
	}else{
		document.getElementById("top").style.width="auto";
	}

	canvas.width =canvasWidth;
	canvas.height=canvasHeight;
	cellWidth=canvasHeight/40;
}


function resetClipboard(){
	pasteArea.isActive=false;
	if(activeClipboard===0)
		activeClipboard=parseInt(document.getElementById("copyMenu").previousElementSibling.innerText);
}

function uncheckSiblings(self) {
	[...self.parentElement.children].forEach(element=>{
		if(element!==self)element.checked=false
	});
}

//TODO: rewrite for worker
function importRLE(rleText){
	worker.postMessage({type:"import",args:rleText});
}

function exportRLE(){
	return patternToRLE(exportPattern().pattern);
}

function clearRLE(){
	document.getElementById("rle").value="";
}

function copyRLE(){
	document.getElementById("rle").select();
	document.getElementById("rle").setSelectionRange(0, 99999);
	document.execCommand("copy");
}

if(socket)socket.on("addConnection", (id,connectionList) => {
	console.log(connectionList);
	if(clientList[id]===undefined){
		clientList[id]={xPosition:-15,yPosition:-10,zoom:1,color:[Math.ceil(360*Math.random()),Math.ceil(255*Math.random()),Math.ceil(255*Math.random())]};
	}
	for(let id in clientList){
		if(connectionList.indexOf(id)===-1){
			console.log(`deleted ${id}`);
			delete clientList[id];
		}
	}
	// TODO: replace render() here
});

if(socket)socket.on("initializeConnection", (id, connectionList) => {
	clientId=id;
	//make a copy of the list which excludes the clients own id
	let otherConnections=connectionList.slice();
	otherConnections.splice(connectionList.indexOf(socket.id),1);

	//get user position from all other clients
	for(let index in otherConnections){
		console.log(otherConnections[index]);
		clientList[otherConnections[index]]={xPosition:-15,yPosition:-10,zoom:1,color:[Math.ceil(360*Math.random()),Math.ceil(255*Math.random()),Math.ceil(255*Math.random())]};
		socket.emit("requestPosition", otherConnections[index]);
	}

	//request the current state of the grid from a random client
	if(otherConnections.length>0)socket.emit("requestGrid", otherConnections[Math.floor(Math.random()*otherConnections.length)]);
});

if(socket)socket.on("relayRequestPosition", () => {
	socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
	socket.emit("zoom", {id:clientId, zoom:view.z});
});

if(socket)socket.on("relayRequestGrid", (id) => {
	console.log("sending grid");
	if(resetEvent===null){
		if(GRID.type===0){
			console.log(readPattern(-GRID.head.distance/4, GRID.head.distance/4, GRID.head.distance/4, -GRID.head.distance/4));
			socket.emit("sendGrid",{type:GRID.type, finite:GRID.finiteArea, data:[-GRID.head.distance/4, -GRID.head.distance/4, readPattern(-GRID.head.distance/4, GRID.head.distance/4, GRID.head.distance/4, -GRID.head.distance/4)]}, id);
		}else{
			socket.emit("sendGrid",{type:GRID.type, finite:GRID.finiteArea, data:GRID.finiteArray}, id);
		}
	}else{
		if(GRID.type===0){
			socket.emit("sendGrid",{type:resetEvent.type, finite:GRID.finiteArea, data:[(getLeftBorder(GRID.head)??0)/2-0.5, (getTopBorder(GRID.head)??0)/2-0.5, readPattern((getTopBorder(GRID.head)??0)/2-0.5,(getRightBorder(GRID.head)??0)/2+0.5,(getBottomBorder(GRID.head)??0)/2+0.5,(getLeftBorder(GRID.head)??0)/2-0.5,resetEvent)]}, id);
		}else{
			socket.emit("sendGrid",{type:resetEvent.type, finite:GRID.finiteArea, data:resetEvent.finiteArray}, id);
		}
	}
	if(socket)socket.emit("rule", rulestring);
});

if(socket)socket.on("relaySendGrid", msg => {
	console.log(msg);
	GRID.type=msg.type;
	if(GRID.type!==0){
		GRID.finiteArea.margin=msg.finite.margin;
		GRID.finiteArea.top=msg.finite.top;
		GRID.finiteArea.right=msg.finite.right;
		GRID.finiteArea.bottom=msg.finite.bottom;
		GRID.finiteArea.left=msg.finite.left;
		GRID.finiteArea.newTop=msg.finite.top;
		GRID.finiteArea.newRight=msg.finite.right;
		GRID.finiteArea.newBottom=msg.finite.bottom;
		GRID.finiteArea.newLeft=msg.finite.left;
		GRID.finiteArray=msg.data;
		console.log(GRID.finiteArray);
		console.log(GRID.finiteArea);
	}else{
		console.log(msg.data);
		if(msg.data[2].length>0)writePattern(...msg.data, GRID);
	}
	// TODO: replace render() here
});

if(socket)socket.on("deleteConnection", id => {
	delete clientList[id];
	// TODO: replace render() here
});

if(socket)socket.on("relayPan", msg => {
	clientList[msg.id].xPosition=msg.xPosition;
	clientList[msg.id].yPosition=msg.yPosition;
	// TODO: replace render() here
});

if(socket)socket.on("relayZoom", msg => {
	clientList[msg.id].zoom=msg.zoom;
	// TODO: replace render() here
});

if(socket)socket.on("relayDraw", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		for(let i=0;i<msg.length;i++){
			writePattern(msg[i].x,msg[i].y,[[msg[i].newState]], GRID);
		}
	}else{
		for(let i=0;i<msg.length;i++){
			writePattern(msg[i].x,msg[i].y,[[msg[i].newState]],resetEvent);
		}
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayUndoDraw", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		for(let i=0;i<msg.length;i++){
			writePattern(msg[i].x,msg[i].y,[[msg[i].oldState]], GRID);
		}
	}else{
		for(let i=0;i<msg.length;i++){
			writePattern(msg[i].x,msg[i].y,[[msg[i].oldState]],resetEvent);
		}
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayPaste", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		writePattern(...msg.newPatt, GRID);
	}else{
		writePattern(...msg.newPatt, resetEvent);
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayUndoPaste", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		writePattern(...msg.oldPatt, GRID);
	}else{
		writePattern(...msg.newPatt, resetEvent);
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayRule", msg => {
	if(msg!==rulestring){
		setRule(msg);
		resetHashtable();
		document.getElementById("rule").value=msg;
		alert("rule changed to: "+msg);
	}
});

if(socket)socket.on("relayChangeGrid", msg => {
	let results=exportPattern();
	console.log("importGridPattern");
	importPattern(...msg);
	// TODO: replace render() here
});
