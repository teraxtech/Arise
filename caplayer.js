"use strict"

class Pointer {
	constructor(x, y, id=0) {
		this.dragX=x;
		this.dragY=y;
		this.x=x;
		this.y=y;
		this.id=id;
    this.objectBeingDragged=null;
	}
	get deltaX() { return this.dragX - this.x; }
	get deltaY() { return this.dragY - this.y; }
}

//accepts 0, 2, or 3 arguments to create an empty pattern object
//accepts 1 argument to clone the argument 
function Pattern(width=0, height=0, fill=0){
	let emptyPattern = new Array(width).fill(null).map(()=>Array(height).fill(fill));
	if(arguments.length===1)emptyPattern = arguments[0];

	Object.defineProperty(emptyPattern, "isEmpty", {get: () => emptyPattern.length===0||emptyPattern[0].length===0});
	Object.defineProperty(emptyPattern, "width", {get: () => emptyPattern.length});
	Object.defineProperty(emptyPattern, "height", {get: () => emptyPattern.length===0?0:emptyPattern[0].length});
	
	return emptyPattern;
}

class Area {
  constructor(top=0, right=0, bottom=0, left=0){
    this.top=top;
    this.right=right;
    this.bottom=bottom;
    this.left=left;
  }
	
	get bounds () { return [this.top, this.right, this.bottom, this.left]};
  
  setLocation(x, y){
    this.bottom+=y-this.top;
    this.right+=x-this.left;
    this.top=y;
    this.left=x;
  }

  setSize(top, right, bottom, left){
    this.top=arguments.length===1?arguments.top:top;
    this.right=arguments.lenght===1?arguments.right:right;
    this.bottom=arguments.lenght===1?arguments.bottom:bottom;
    this.left=arguments.lenght===1?arguments.left:left;
  }

	//test if the coordinate is within the area + plus a margin
	isWithinBounds(x, y, margin=0){
		if(x<this.left-margin)return false;
		if(x>=this.right+margin)return false;
		if(y<this.top-margin)return false;
		if(y>=this.bottom+margin)return false;
		return true;
	}
}

class DraggableArea extends Area {  
	constructor(top=0, right=0, bottom=0, left=0){
		super(top, right, bottom, left);
		this.edgeBeingDragged = 0;
	}

	//check if the coordinates allows something to be dragged, return null otherwise
	attemptDrag(x,y){
		// the margin for selecting the edges within the selectArea
		// is 4/view.z wide, but also less than the half the width
		//
		// edgebeingdragged:
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
		if(x<Math.min(this.left+4/view.z,(this.right+this.left)/2)){
			this.edgeBeingDragged=-3;
			isPlaying=false;
		}else if(x>Math.max(this.right-4/view.z,(this.right+this.left)/2)){
			this.edgeBeingDragged=3;
			isPlaying=false;
		}
		if(y<Math.min(this.top+4/view.z,(this.bottom+this.top)/2)){
			this.edgeBeingDragged+=1;
			isPlaying=false;
		}else if(y>Math.max(this.bottom-4/view.z,(this.bottom+this.top)/2)){
			this.edgeBeingDragged-=1;
			isPlaying=false;
		}
		return (this.edgeBeingDragged===0)?null:this;
	}

	//called to update the object if it is being dragged
	drag(x, y){
		//drag top edge
		if(mod(this.edgeBeingDragged,3)===2){
      this.bottom=y+1;
			if(y<this.top){
				this.bottom=this.top+1;
				this.edgeBeingDragged+=2;
			}
			if(this.edgeBeingDragged===-1){
				if(x<this.left)this.edgeBeingDragged=-4;
				if(x>this.right)this.edgeBeingDragged=2;
			}
		}
		//drag left edge
		if(this.edgeBeingDragged>=-4&&this.edgeBeingDragged<=-2){
			this.left=x;
			if(x>=this.right-1){
				this.left=this.right-1;
				this.edgeBeingDragged+=6;
			}
			if(this.edgeBeingDragged===-3){
				if(y<this.top)this.edgeBeingDragged=-2;
				if(y>this.bottom)this.edgeBeingDragged=-4;
			}
		}
		//drag top edge
		if(mod(this.edgeBeingDragged,3)===1){
			this.top=y;
			if(y>=this.bottom-1){
				this.top=this.bottom-1;
				this.edgeBeingDragged-=2;
			}
			if(this.edgeBeingDragged===1){
				if(x<this.left)this.edgeBeingDragged=-2;
				if(x>this.right)this.edgeBeingDragged=4;
			}
		}
		//drag right edge
		if(this.edgeBeingDragged>=2&&this.edgeBeingDragged<=4){
			this.right=x+1;
			if(x<this.left+1){
				this.right=this.left+1;
				this.edgeBeingDragged-=6;
			}
			if(this.edgeBeingDragged===3){
				if(y<this.top)this.edgeBeingDragged=4;
				if(y>this.bottom)this.edgeBeingDragged=2;
			}
		}
  }
	
	reset(){ this.edgeBeingDragged = 0; }
}

class ClipboardSlot extends DraggableArea {
	constructor(pattern, left=0, top=0){
		super(top, left+pattern.width, top+pattern.height, left);
		this.pointerRelativeX=0;
		this.pointerRelativeY=0;
		this.pattern=pattern;
		this.previewBitmap=patternToBitmap(pattern);
	}

	attemptDrag(x,y){
		this.pointerRelativeX=x-this.left;
		this.pointerRelativeY=y-this.top;
		return this;
	}

	reset(){};

	drag(x,y){
		this.bottom+=y-this.top-pasteArea.pointerRelativeY;
		this.right+=x-this.left-pasteArea.pointerRelativeX;
		this.top=y-pasteArea.pointerRelativeY;
		this.left=x-pasteArea.pointerRelativeX;
	}
}

class Marker extends Area {
	constructor(area) {
		super(area.top, area.right, area.bottom, area.left);
		this.pattern=area.pattern ?? new Pattern();
	}
	static list = [];
	static selectedIndex = null;
}

//TODO: implement an object to handle backaend state and methods, possibly with general worker class.
let usedIDs = 0;
class Thread{
	constructor(worker){
		this.worker = new Worker(worker);
		this.timeOfLastMessage = Date.now();
		this.actionHandlerMap = {};
		this.worker.onmessage = this.onmessage.bind(this);
	}

	postMessage(action){
		const id = usedIDs++;
		return new Promise((resolve, reject) => {
			const message = { id, ...action };
			this.worker.postMessage(message);
			//store a callback for the funtion which handles the response from the worker
			this.actionHandlerMap[id] = (response) => {
				resolve(response);
			};
		});
	}

	onmessage(e){
		this.timeOfLastMessage = Date.now();
		if(Object.hasOwn(e.data, "id")){
			const { id, response } = e.data;
			if(!this.actionHandlerMap[id]) return;
			this.actionHandlerMap[id].call(this, response);
			delete this.actionHandlerMap[id];
		}

		switch(e.data.type){
			case "alert":
        alert(e.data.value);
				break;
			case "ruleMetadata":
				ruleMetadata = e.data.ruleMetadata;
				//initializes the menu of draw states
				setDrawMenu();
				if(socket)socket.emit("rule", ruleMetadata.string);
				updateCanvasColor(true);
				break;
			case "render":
				visiblePattern=new Pattern(e.data.pattern);
				visiblePatternLocation.y = e.data.top;
				visiblePatternLocation.x = e.data.left;
				if(GRID.backgroundState!==e.data.backgroundState){
					canvas.style.backgroundColor=ruleMetadata.color[e.data.backgroundState][e.data.backgroundState];
				}
				GRID.backgroundState = e.data.backgroundState;
				if(clearDrawnCells){
					drawnCells=[];
					clearDrawnCells=false;
				}
				requestAnimationFrame(render);
				document.getElementById("population").innerHTML="Population "+e.data.population;
				document.getElementById("gens").innerHTML="Generation "+e.data.generation;
				break;
      case "identificationResults":
        document.getElementById("identifyOutput").innerHTML=`
          <span>
            select area width: ${e.data.area.right-e.data.area.left}\n
            select area height: ${e.data.area.bottom-e.data.area.top}\n
            period: ${e.data.value.period}\n
            x displacement: ${e.data.value.dx}\n
            y displacement: ${e.data.value.dy}
            time elapsed: ${Math.ceil(e.data.value.timeElapsed)}
          </span>
          <canvas id="identifiedShip" style="float: none;margin: none;"></canvas>`;
        let canvasElement=document.getElementById("identifiedShip").getContext("2d");

        const bitmap=patternToBitmap(e.data.value.phases[0]);
        document.getElementById("identifiedShip").width=bitmap.width;
        document.getElementById("identifiedShip").height=bitmap.height;
        canvasElement.drawImage(bitmap,0,0);
        break;
			case "shift":
				if(e.data.args[0]==="Select Area"){
					if(selectArea)selectArea.setLocation(selectArea.top+parseInt(e.data.args[2]), selectArea.left+parseInt(e.data.args[1]));
				}else if(e.data.args[0]==="Paste Area"&&pasteArea){
					pasteArea.top+=parseInt(e.data.args[2]);
					pasteArea.left+=parseInt(e.data.args[1]);
					paste();
				}
				break;
		}
	}
}

const worker = new Thread("worker.js");

var
	//index of currently active clipbaord
	activeClipboard=1,
	//canvas element
	canvas=document.getElementById("ourCanvas"),
	//whether the code should capture the onScroll event for zooming in and out
	captureScroll=false,
	//width of each cell
	cellWidth=20,
	//copy paste clipboard
	clipboard=Array.from({length: 3}, () => new ClipboardSlot(new Pattern())),
	//canvas context
	ctx=canvas.getContext("2d"),
	//this determines if the UI is using the dark theme.
	darkMode=1,
	//canvas fill color(0-dark,1-light)
	detailedCanvas=true,
	//what format should the rulestring be exported as
	exportFormat="BSG",
	//whether the cursor draws a specific state or changes automatically;-1=auto, other #s =state
	drawMode=1,
	//list of cells drawn in one action
	drawnCells=[],
	//to be cleared
	clearDrawnCells=false,
	//this determines whether the simulation is in draw, move, or select mode
	editMode=0,
	//state of the grid
	GRID={
		//which kind of grid is being used
		type:0,//0=infinite,1=finite,2=toroidal
		//data for the cells on an infinte grid
		head:null,
		//data for the cells on a finite grid
		finiteArray:new Pattern(),
		//area representing a finite portion of the grid
		finiteArea:new DraggableArea(),
    //margin of permantly off cells around the pattern
    margin:false,
		//state of the background(used for B0 rules)
		backgroundState:0
	},
	//used for rendering user caused changes
	isKeyPressed=false,
	//whether or not the sim is playing
	isPlaying=false,
	//array of key states
	key=[],
	//list of mouse,pointers, touch instances, and other styluses
	pointers=[],
	//TODO: store dimensions as array and add getters for top, left, etc...
	//area containing the pattern to be pasted
	pasteArea=null,
	//point where the simulator resets to
	resetEvent=null,
	//rule stored internally as an n-tree for a n state rule
	rule,
	//number of nodes in the rule, rule family(INT, Generations, History), color
	ruleMetadata={size:0,
                family:"INT",color:[[]],
                numberOfStates:2,
                aliveState:[1,1],
                deadState:[0,0],
                forceDeath:[false,false],
                forceLife:[false,false]},
	//selected area
	//TODO: store dimensions as array and add getters for top, left, etc...
	selectArea=null,
	//keeps track of when the last generation occurred
	timeOfLastGeneration=0,
	//position of the current view(x/y position,zoom)
	view={
		x:-30,y:-20,z:1,
		//position of the view for when a pointer clicks or touches
		touchX:0,touchY:0,touchZ:1,
	},
	visiblePattern=new Pattern(),
	visiblePatternLocation={x:0,y:0},
	//set to true if the sim was reset in/before the current generation
	wasReset=false,
	//window and canvas dimensions
	windowHeight=0,windowWidth=0,canvasWidth=0,canvasHeight=0;

let countRenders = 0;
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
	//register key inputs
	repeatingInput();
	//draw the simulation
	render();
	//call the next frame if if the simulation is playing or a key is pressed
	if(isKeyPressed)requestAnimationFrame(main);
}
requestAnimationFrame(main);

function mod(num1,num2){
	return (num1%num2+num2)%num2;
}

function distance(num1, num2){
	return Math.sqrt(num1*num1+num2*num2);
}

function getNum(string){
	return parseInt(string.match(/\d+/)[0]);
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
				if(i>0){
					document.getElementById("copyMenu").innerHTML+=`<button onclick="changeCopySlot(this);" onmouseenter="showPreview(this);">${i+2}<canvas class="patternPreview"></canvas></button>`;
					clipboard.push({pattern:new Pattern(),previewBitmap:null});
				}
			}
			break;
		case "selA":
			setActionMenu();
			area=value.split(".").map(str => parseInt(str));
			selectArea=new DraggableArea(...area);
			break;
		//TODO: remove since paste area is now just a visible clipboardSlot, kept temporarily as reference
		// case "pasteA":
		// 	setActionMenu();
		// 	area=value.split(".").map(str => parseInt(str));
		//
		// 	pasteArea.top=area[0];
		// 	pasteArea.left=area[1];
		// 	break;
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
        //TODO: change this line to use the area class functionality
				// GRID.finiteArea={margin:GRID.type===1?1:0,top:area[0],right:area[1],bottom:area[2],left:area[3],newTop:area[0],newRight:area[1],newBottom:area[2],newLeft:area[3]},
				//add appropriate margin to pattern
				GRID.finiteArray=baseNToPattern(area[1]-area[3]+2*GRID.margin,area[2]-area[0]+2*GRID.margin,LZ77ToBaseN(value.split(".")[5]));
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
				Marker.list[attributes[i]]={activeState:1,top:attributes[i+1],right:attributes[i+2],bottom:attributes[i+3],left:attributes[i+4],pattern:new Pattern()};
				if(attributes[i+5]!=="")Marker.list[attributes[i]].pattern=baseNToPattern(attributes[i+2]-attributes[i+4],attributes[i+3]-attributes[i+1],LZ77ToBaseN(attributes[i+5]));
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

async function exportSimulation(){
	let text=`${window.location.protocol}//${window.location.host}
		${window.location.pathname}?v=0.5.0`;

  //TODO: rewrite
	// if(resetEvent!==null)setEvent(resetEvent);
	text+="&draw="+drawMode;

	const generation=getNum(document.getElementById("gens").innerHTML);
	if(generation!==0)text+="&gen="+generation;

	if(GRID.backgroundState!==0)text+="&background="+GRID.backgroundState;

	const stepSize = parseInt(document.getElementById("step").value);
	if(stepSize&&stepSize!==1)text+="&step="+stepSize;

	if(activeClipboard!==1)text+="&slot="+activeClipboard;

	let workerTasks=[];

	let clipboardParameters;
	if(clipboard.length>3||!clipboard[1].pattern.isEmpty){
		clipboardParameters = new Array(clipboard.length).fill("");
		workerTasks.push(Promise.all(clipboard.map((value, index) => {
			return worker.postMessage({type:"export", outputFormat:"LZ77", inputPattern:"clipboard"+(index+1)}).then((response) => {
				if(!(value.pattern.isEmpty)){
					clipboardParameters[index]+=`${value.pattern.width}.${value.pattern.height}.${response}`;
				}else{
					clipboardParameters[index]+="0.0.";
				}
			});
		})).then(() => {
			console.log(clipboardParameters);
			return "&slots="+clipboardParameters.join(".");
		}));
	}

	if(selectArea)text+=`&selA=${selectArea.top}.${selectArea.right}.${selectArea.bottom}.${selectArea.left}`;

	if(pasteArea)text+=`&pasteA=${pasteArea.top}.${pasteArea.left}`;
	
	if(isElementCheckedById("resetStop")===false)text+="&resetStop=false";

	if(ruleMetadata.string!=="B3/S23"){
		text+="&rule="+encodeURIComponent(ruleMetadata.string);
	}
	
	workerTasks.push(Promise.all([
		worker.postMessage({type: "getBounds"}),
		worker.postMessage({type:"export", outputFormat:"LZ77", inputPattern:"Grid"})
	]).then((responses) => {
		text+=`&pat=${GRID.type}.${responses[0].join(".")}.${responses[1]}`;
		console.log("type0write");
	}));

	if(document.getElementById("density").value!=="50"){
		text+="&ratio="+document.getElementById("density").value;
	}

	const markerPromises = [];
	let markerParameters = [];
	for (const [index, marker] of Marker.list.entries())if(marker){
		if(marker.pattern.isEmpty){
			markerParameters[index]=`${marker.bounds.join(".")}.`;
		}else{
			markerPromises.push(worker.postMessage({type:"export", outputFormat:"LZ77", inputPattern:"Direct", pattern:marker.pattern}).then((response) => {
				markerParameters[index]=`${marker.bounds.join(".")}.${response}`;
			}));
		}
	}
	workerTasks.push(Promise.all(markerPromises).then(() => {
		return "&marker="+markerParameters.join(".");
	}));

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
	
	Promise.all(workerTasks).then((responses) => {
		text+=responses.join("");

		document.getElementById("settingsExport").innerHTML=text;
		document.getElementById("settingsExport").href=text;
	});
}

function drawCell(x, y){
	let queueEnd = drawnCells[drawnCells.length - 1];
	if(GRID.type===0||(y>=GRID.finiteArea.top&&x<GRID.finiteArea.right&&y<GRID.finiteArea.bottom&&x>=GRID.finiteArea.left)){
		if(queueEnd.length===0){
			queueEnd.push({x:x, y:y, oldState:null, newState: -1});
		}else if(queueEnd[queueEnd.length-1].x!==x||queueEnd[queueEnd.length-1].y!==y){
			queueEnd.push({x:x, y:y, oldState:null, newState: queueEnd[0].newState});
		}
	}
	render();
}

//TODO: replace reading and writing to clipboard with navigator API
window.addEventListener("copy", (event) => {
	if (/[^input|textarea|select]/i.test(document.activeElement.tagName)) {
		if(event.cancelable)event.preventDefault();
		exportRLE().then((response) => {
			return navigator.clipboard.writeText(response);
		}).then(
			() => { console.log("successfully copied"); },
			() => { alert("failed to copy pattern to clipboard"); }
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
  if([9,32,37,38,39,40].includes(event.keyCode))return;
  if(event.target.nodeName==="TEXTAREA")return;
  if(event.target.nodeName==="INPUT"&&event.target.type==="text")return;
  if(event.ctrlKey===true)return;

  key[event.keyCode]=true;

  if(isKeyPressed===false)requestAnimationFrame(main);
  //set the flag that a key is down
  isKeyPressed=true;

  switch(event.keyCode){
  case 13: start(); break;//enter
  case 46: deleteMarker(); break;//delete
  case 49: setDrawMode(); break;//1
  case 50: setMoveMode(); break;//2
  case 51: setSelectMode(); break;//3
  case 67: editArea("copy"); break;//c
  case 70://f
    if(pasteArea){
      //to rotate the paste area
      if(key[16]){
        //counter clockwise
        flipOrtho("vertical");//F
      }else{
        //clockwise
        flipOrtho("horizonal");//f
      }
    }else{
      fitView();
    }
    break;
  case 73: //i
    if(key[16]){
      editArea("increment"); break;//I
    }else{
      editArea("invert"); break;//i
    }
  case 75: editArea("clear"); break;//k
  case 77: setMark(); break;//m
  case 78: next(); break;//n
  case 82://r
    if(selectArea){
      //to randomize the select area
      editArea("randomize", selectArea);
    }else if(pasteArea){
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
  case 83: if(key[16])selectAll(); break;//s and shift
  case 84://t
    reset();
    break;
  case 86://v
    paste();
    // TODO: replace render() here
    break;
  case 88://x
    editArea("cut");
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
};

window.onkeyup = function(event){
	key[event.keyCode]=false;

	isKeyPressed=false;
	for(let h in key){
		if(key[h]===true)isKeyPressed=true;
	}
};

window.onresize = function(){
	scaleCanvas();
	render();
	updateDropdownMenu();
};

window.onscroll = function(){
	captureScroll=false;
	updateDropdownMenu();
};

canvas.onpointerdown = (event) => {
	canvas.setPointerCapture(event.pointerId);
	inputReset();
  //resets clearDrawnCells after a non draw pointer event, one which deesn't trigger a render message from the worker
  clearDrawnCells=false;

	pointers.push(new Pointer(event.clientX-canvas.getBoundingClientRect().left,event.clientY-canvas.getBoundingClientRect().top, event.pointerId));

	//coordinates of the touched cell
	let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
	let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
	switch(editMode){
		case 0:
		drawnCells.push([]);
		drawCell(x,y);
    //get the cell state to be used for drawing from the worker [x, y]
		//TODO: reaname args to something less esoteric 
		worker.postMessage({ type:"writeCell", args:[x, y, drawnCells.length-1]})
    //use the recieved cell state to set the state of any cells already drawn
		.then((response) => {
      try{
        for(const cell of drawnCells[response.index])
          if(cell.newState===-1)cell.newState = response.state===0?drawMode:0;
        if(pointers.length===0)sendDrawnCells(drawnCells[response.index], response.index);
      }catch(e){throw new Error(e)}
		});
		break;
		case 1: move(x,y); break;
		case 2: select(x,y); break;
	}
}

canvas.onpointermove = (event) => {
	const index = pointers.findIndex((p) => p.id === event.pointerId);
  //TODO: add ability to draw while the rule (eg. history) is loading
	if(pointers.length>0){
		pointers[index].x=event.clientX - canvas.getBoundingClientRect().left;
		pointers[index].y=event.clientY - canvas.getBoundingClientRect().top;
		let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
		let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
		if(pointers[0].objectBeingDragged!==null){
			pointers[0].objectBeingDragged.drag(x,y);
			render();
		}else{
			switch(editMode){
				case 0: drawCell(x,y); break;
				case 1: move(x,y); break;
				case 2: select(x,y); break;
			}
		}
	}
}

canvas.onpointerup = (event) => {
	if(pointers[0].objectBeingDragged)pointers[0].objectBeingDragged.reset();
	pointers = [];
	const index = pointers.findIndex((p) => p.id === event.pointerId);
	pointers.splice(index, 1);
	inputReset();

	clearDrawnCells=true;
  render();
}

//controls zooming of the camera using the mouse wheel
canvas.onwheel = function(event){
	if(captureScroll===true){
		if(event.cancelable)event.preventDefault();
		const mouseX = event.clientX-canvas.getBoundingClientRect().left;
		const mouseY = event.clientY-canvas.getBoundingClientRect().top;
		zoom(1-0.1*Math.sign(event.deltaY), mouseX, mouseY);

		worker.postMessage({type:"move",view:{x:view.x, y:view.y, z:view.z}});
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

function sendDrawnCells(element, index){
	//TODO: clear cells to be drawn after a new pattern to render is received
	if(element.length>0&&element[0].newState!==-1){
		worker.postMessage({type:"drawList", editList:element}).then((changedCells) => {
			if(socket&&resetEvent===null)socket.emit("draw", Date.now(), changedCells);
		});
		// delete drawnCells[index];
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
	drawnCells.forEach(sendDrawnCells);
  //shift the pattern if the finite area is resized
  //TODO: figure out why the finite area changes but finite array does not
	if(GRID.finiteArea.edgeBeingDragged!==0){
		let resizedArray=new Pattern(GRID.finiteArea.right-GRID.finiteArea.left+(GRID.type===1?2:0),GRID.finiteArea.bottom-GRID.finiteArea.top+(GRID.type===1?2:0));
		for(let i=0; i<resizedArray.length;i++){
			for(let j=0; j<resizedArray.height;j++){
				if(i>=GRID.finiteArea.left-GRID.finiteArea.left+GRID.margin&&i<GRID.finiteArea.left-GRID.finiteArea.left+GRID.finiteArray.width-GRID.margin&&j>=GRID.finiteArea.top-GRID.finiteArea.top+GRID.margin&&j<GRID.finiteArea.top-GRID.finiteArea.top+GRID.finiteArray.height-GRID.margin){
					resizedArray[i][j]=GRID.finiteArray[i+GRID.finiteArea.left-GRID.finiteArea.left][j+GRID.finiteArea.top-GRID.finiteArea.top];
				}else{
					resizedArray[i][j]=GRID.backgroundState;
				}
			}
		}
		GRID.finiteArray=resizedArray;
	}
}

//gets key inputs
function repeatingInput(){
	//] to zoom in
	if(key[221]) zoom(1.05);
	//[ to zoom out
	if(key[219]) zoom(0.95);
	//wasd keys for move when shift is not pressed
	if(!key[16]){
		if(key[65]) view.x-=0.5/view.z;
		if(key[87]) view.y-=0.5/view.z;
		if(key[68]) view.x+=0.5/view.z;
		if(key[83]) view.y+=0.5/view.z;
		if((key[65]||key[87]||key[68]||key[83]||key[219]||key[221])&&resetEvent===null){
			if(socket)socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
			//coordinates of the touched cell
			worker.postMessage({type:"move",view:{x:view.x, y:view.y, z:view.z}});
      //drawstate can be !=-1 without a pointer due to async if you draw and move while busy(eg. loading a rule)
			if(pointers.length>0&&drawnCells&&drawnCells[drawnCells.length-1]) drawCell();
		}
	}
	if(pointers.length>0&&pointers[0].objectBeingDragged){
		let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
		let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
		pointers[0].objectBeingDragged.drag(x,y);
		render();
	}
}

//TODO: add + and - keybingings to adjust speed
function setSimSpeed(element){
  worker.postMessage({type: "setSpeed", value: parseInt(element.value)});
}

function setColors(){
  if(ruleMetadata.family !== "INT" && ruleMetadata.family !== "Generations")return;

  for (let backgroundState = 0; backgroundState < ruleMetadata.numberOfStates; backgroundState++) {
    const palette = ruleMetadata.color[backgroundState] = new Array(ruleMetadata.numberOfStates);
    for (let cellState = 0; cellState < palette.length; cellState++) {
      const displayedState = document.getElementById("antiStrobing").checked?(cellState-backgroundState+ruleMetadata.numberOfStates)%ruleMetadata.numberOfStates:cellState;
       
			if(displayedState===0){
				palette[cellState] = darkMode?"#222222":"#F1F1F1";
			}else if(displayedState===1){
				palette[cellState] = darkMode?"#F1F1F1":"#000000";
			}else{
				let color=240/ruleMetadata.numberOfStates*(darkMode?(ruleMetadata.numberOfStates-displayedState):(displayedState-1));
				palette[cellState] = `rgb(${color},${color},${color})`;
			}
    }
  }
	render();
}

function getColor(cellState){
  return ruleMetadata.color[GRID.backgroundState][cellState];
}

//switch to draw mode
function setDrawMode(){
	if(pasteArea){
		resetClipboard();
	}
	captureScroll=true;
	editMode=0;
	render();
}

//switch to move mode
function setMoveMode(){
	editMode=1;
	captureScroll=true;
}

//swith to select mode
function setSelectMode(){
	if(selectArea&&editMode===2)selectArea=null;
	resetClipboard();
	setActionMenu();
	editMode=2;
	captureScroll=true;
	render();
}

function setActionMenu(){
	for(let button of document.getElementsByClassName("displayIf")){
		button.style.display="none";
		if(button.classList.contains("select")&&selectArea)button.style.display="block";
		if(button.classList.contains("noSelect")&&selectArea)button.style.display="block";
		if(button.classList.contains("noArea")&&selectArea&&pasteArea)button.style.display="block";
		if(button.classList.contains("paste")&&pasteArea)button.style.display="block";
		if(button.classList.contains("marker")&&Marker.selectedIndex!==null) button.style.display="block";
	}
}

function setButtonColor(element,state){
  let brightness = 0;
  if(/#[0-9A-F]{6}/.test(getColor(state))){
    const [R, G, B] = getColor(state).match(/[0-F]{2}/g).map((value) => parseInt(value, 16));
    brightness = Math.sqrt(0.299*R*R + 0.587*G*G + 0.114*B*B);//source: https://alienryderflex.com/hsp.html
  }else console.log(getColor(state), " is not in #RRGGBB format");
	element.style.backgroundColor=getColor(state);
	if(brightness>128){
		element.style.color="#000000";
	}else{
		element.style.color="#BBBBBB";
	}
}

function setDrawMenu(){
  //calculate colors for each state of the current rule
  setColors();
  
	const menu = document.getElementById("drawMenu").children[1];
	menu.innerHTML="";
	for(let i=0;i<ruleMetadata.numberOfStates;i++){
		menu.innerHTML+=`<button onclick="changeDrawMode(this);">${i}</button>`;
		setButtonColor(menu.children[i], i);
	}
	menu.children[drawMode].style.display = "none";
	setButtonColor(menu.parentNode.children[0], drawMode);
}

function patternToBitmap(pattern){
	if(pattern.isEmpty)return null;
	const cellWidth = 200/(pattern.width);
	const canvasWidth=200, canvasHeight=Math.ceil(cellWidth*(pattern.height));
	const offscreenCanvas = new OffscreenCanvas(canvasWidth,canvasHeight);
	const context = offscreenCanvas.getContext("2d");
	context.scale(1,1);

	if(darkMode){
		context.strokeStyle="#999999";
	}else{
		context.strokeStyle="#000000";
	}

	for(let i=0;i<pattern.width;i++){
		for(let j=0;j<pattern[i].length;j++){
			context.fillStyle=getColor(pattern[i][j]);
			context.fillRect(i*cellWidth,j*cellWidth,1*cellWidth,1*cellWidth);
		}
	}
	context.lineWidth=1;
	context.beginPath();
	for(let i=0;i<=pattern.width;i++){
		context.moveTo(i*cellWidth,0);
		context.lineTo(i*cellWidth,pattern.height*cellWidth);
	}
	for(let i=0;i<=pattern.height;i++){
		context.moveTo(0,i*cellWidth);
		context.lineTo(pattern.width*cellWidth,i*cellWidth);
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

function duplicateLastChild(element){
	element.appendChild(element.lastElementChild.cloneNode(true));
}

function changeCondition(element){
	const dropdown=element.parentElement.parentElement;

	while(dropdown.nextSibling){
		dropdown.nextSibling.remove();
	}

	replaceDropdownElement(element);
	dropdown.parentElement.appendChild(document.getElementById(element.innerText+" Condition Template").content.cloneNode(true));
	dropdown.parentElement.appendChild(document.getElementById("conditionHTML").content.cloneNode(true));
	updateSearch(dropdown);
}

function updateSearch(element){
	const searchOption = element.parentElement;
	const optionIndex = Array.from(searchOption.parentElement.children).indexOf(searchOption);
	const args = searchOption.children;
	let conditionIndices = [], parsedArgs = [];
	for(let i=1;i<args.length-1;i++){
		parsedArgs.push(args[i].tagName==="INPUT"?args[i].value:args[i].children[0].innerText);
		if(args[i].classList.contains("condition")) conditionIndices.push(i-1);
	}
	worker.postMessage({type:"updateSearchOption", optionIndex, conditionIndices, parsedArgs}).then(() => {
		//
	});
	updateSelectors();
}
//TODO: add funtion which copies all the parameters of a search option to the web worker
function changeAction(element){

	const option=element.parentElement.parentElement.parentElement;
	const dropdown=element.parentElement.parentElement;
	while(dropdown.nextSibling){
		dropdown.nextSibling.remove();
	}

	//add another space to the search options when the last is selected
	if(document.getElementById("searchOptions").lastElementChild===option){
		duplicateLastChild(document.getElementById("searchOptions"));
	}
	
	replaceDropdownElement(element);
	option.appendChild(document.getElementById(element.innerText+" Action Template").content.cloneNode(true));
	option.appendChild(document.getElementById("conditionHTML").content.cloneNode(true));
	//append a reset option to the top level condition dropdown(prevents feedbackloops by only adding reset condition to non reset actions)
	if(element.innerText!=="Reset"){
		option.lastElementChild.children[1].innerHTML+="<button onclick='changeCondition(this);'>Reset</button>";
	}

	updateSearch(dropdown);
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
	if(clipboard[clipboard]&&clipboard[clipboardIndex].pattern[0]){
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
		clipboard.push({pattern:new Pattern(),previewBitmap:null});
	}
	
	//update the copy slot settings
	activeClipboard=parseInt(target.innerText);
	if(pasteArea) pasteArea=clipboard[activeClipboard];

	replaceDropdownElement(target);
	//update the menus containing "Select Area","Marker 1", "Marker 2", etc...
	updateSelectors();
	render();
}

function changeGridType(target){
	let dropdown = target.parentElement;

	let targetIndex = Array.from(dropdown.children).indexOf(target);
	console.log("change GRID");
	worker.postMessage({type:"setGrid", grid: targetIndex}).then((response) => {
		GRID.type=targetIndex;
		GRID.margin=targetIndex===1?1:0;
		GRID.finiteArea.setSize(...response);
		render();
		if(socket)socket.emit("changeGrid", response);
	});



	replaceDropdownElement(target);
	render();
}

function changeDrawMode(target){
	let dropdown = target.parentElement;

	//update the draw state settings
	drawMode=Array.from(dropdown.children).indexOf(target);

	setButtonColor(document.getElementById("drawMenu").children[0],drawMode);

	replaceDropdownElement(target);
}

function deleteOption(target){
	let option=target.parentElement;
	if(option.nodeName==="BUTTON")option=option.parentElement;
	if(option!==option.parentElement.lastElementChild)option.remove();
	if("info" in option)delete option.info;
}

function selectAll(){
  pasteArea=null;
  setActionMenu();
  worker.postMessage({type: "getBounds"}).then((response) => {
    selectArea=new DraggableArea(...response)  });
  render();
}

function editArea(action, area=selectArea){
	if(pasteArea){
		resetClipboard();
	}else if(selectArea){
    worker.postMessage({type:action, area:area, drawMode:drawMode, clipboard:activeClipboard, randomFillPercent:document.getElementById("density").value/100}).then((response) => {
      if(action==="copy"||action==="cut"){
				clipboard[activeClipboard]=new ClipboardSlot(new Pattern(response), selectArea.left, selectArea.top);
        selectArea=null;
      }
			setActionMenu();
			render();
    });
		render();
	}
}

function paste(){
	captureScroll=true;
	if(pasteArea){
		worker.postMessage({type:"write", args: [pasteArea.left,pasteArea.top,activeClipboard]});
		//TODO: reimplement this
		// if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
	}else{
		if(clipboard[activeClipboard]&&!clipboard[activeClipboard].pattern.isEmpty){
			pasteArea = clipboard[activeClipboard];
		}
		selectArea=null;
		editMode=1;
		render();
	}
	setActionMenu();
}

//TODO: have these funtions take the pattern as an argument
//flip the pattern to be pasted
function flipDiag(){
	let newPattern=new Pattern(pasteArea.pattern.height, pasteArea.pattern.width);
	for(let i=0;i<newPattern.width;i++){
		for(let j=0;j<newPattern.height;j++){
			newPattern[i][j]=pasteArea.pattern[j][i];
		}
	}
	pasteArea.left-=Math.trunc(newPattern.width/2-newPattern.height/2);
	pasteArea.top +=Math.trunc(newPattern.width/2-newPattern.height/2);
	pasteArea.pattern=newPattern;
}

//flip the pattern to be pasted
function flipOrtho(direction="horizonal"){
	let newPattern=new Pattern(pasteArea.pattern.width, pasteArea.pattern.height);
	for(let i=0;i<newPattern.width;i++){
		for(let j=0;j<newPattern.height;j++){
			if(direction==="horizonal"){
				newPattern[i][j]=pasteArea.pattern[pasteArea.pattern.width-1-i][j];
			}else{
				newPattern[i][j]=pasteArea.pattern[i][pasteArea.pattern.height-1-j];
			}
		}
	}
	pasteArea.pattern=newPattern;
	worker.postMessage({type:"transformClippedPattern", pattern:newPattern, clipboard:activeClipboard});
	pasteArea.previewBitmap=patternToBitmap(pasteArea.pattern);
	render();
}

//Chnages the content of dropdowns so that only elements present on the grid
function updateSelectors(){
	let dropdownContents=document.getElementsByClassName("dropdown-content");
	for(let i=0;i<dropdownContents.length;i++){
		const checkForTag = (tag) => dropdownContents[i].className.includes(tag);
		let newDropdownContent = "";
		//keep unchanging portion
		if(checkForTag("pattern-marker")){
			if(dropdownContents[i].children[0])newDropdownContent += dropdownContents[i].children[0].outerHTML;
			for(const [index, marker] of Marker.list.entries())if(marker){
				newDropdownContent += `\n<button onclick="replaceDropdownElement(this);updateSelectors();">Marker ${index+1}</button>`;
			}
		}
		if(checkForTag("copy-slot")){
			for(let j=1;j<clipboard.length-1;j++){
				newDropdownContent +=`<button onclick="replaceDropdownElement(this);updateSearch(this.parentElement.parentElement);">Copy Slot ${j}</button>`;
			}
		}
		if(newDropdownContent)dropdownContents[i].innerHTML = newDropdownContent;
	}
}

function setView(top, right, bottom, left){
	view.x=(right+left-canvasWidth/cellWidth)/2;
	view.y=(bottom+top-canvasHeight/cellWidth)/2;
	view.touchX=0;
	view.touchY=0;
	view.z=Math.min(canvasWidth/cellWidth/(right-left+2),canvasHeight/cellWidth/(bottom-top+2));
	view.touchZ=view.z;
  worker.postMessage({type:"move",view:{x:view.x, y:view.y, z:view.z}});
	updateCanvasColor();
	if(socket&&resetEvent===null){
		socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
		socket.emit("zoom", {id:clientId, zoom:view.z});
	}
}

function fitView(){
	worker.postMessage({type:"getBounds"}).then((response) => setView(...response));
}

function deleteMarker(){
	if(Marker.selectedIndex!==null) Marker.list[Marker.selectedIndex]=undefined;
	updateSelectors();
	setActionMenu();
	// TODO: replace render() here
}

//set default view
function setMark(){
	if(pasteArea){
		for(let h=0;h<Marker.list.length+1;h++){
			if(!Marker.list[h]){
				Marker.list[h]=new Marker(pasteArea);
				pasteArea=null;
				setActionMenu();
				break;
			}
		}
		updateSelectors();
	}else if(selectArea){
		for(let h=0;h<Marker.list.length+1;h++){
			if(!Marker.list[h]){
				setActionMenu();
				Marker.list[h]=new Marker(selectArea);;//{activeState:1, top:selectArea.top, right:selectArea.right, bottom:selectArea.bottom, left:selectArea.left, pattern:new Pattern()};
				selectArea=null;
				break;
			}
		}
		updateSelectors();
	}
	render();
}

function isElementCheckedById(id){
	return document.getElementById(id).checked;
}

function setDark(){
	if(document.getElementById("darkTheme").checked){
		darkMode=1;
		document.getElementById("LightTheme").disabled =true;
		document.getElementById("DarkTheme").disabled =false;
	}else{
		darkMode=0;
		document.getElementById("LightTheme").disabled =false;
		document.getElementById("DarkTheme").disabled =true;
	}
	setDrawMenu();
  updateCanvasColor();
	// TODO: replace render() here
}

//move e frames forward
function next(){
	worker.postMessage({type:"stepSimulation",args:[]});
}

//toggle updating the simulation
function start(){
	if(!isPlaying){
		isPlaying=true;
		worker.postMessage({type:"start",args:[]});
	}else{
		isPlaying=false;
		worker.postMessage({type:"stop",args:[]});
	}
}

function undo(){
	worker.postMessage({type:"stop",args:[]});
	isPlaying=false;
	worker.postMessage({type:"undo",args:[]});
}

function redo(){
	worker.postMessage({type:"stop",args:[]});
	isPlaying=false;
	worker.postMessage({type:"redo",args:[]});
}

function reset() {
	if(isElementCheckedById("resetStop")===true){
		worker.postMessage({type:"stop",args:[]});
		isPlaying=false;
	}
	worker.postMessage({type:"reset",args:[isElementCheckedById("userReset")]});

	wasReset=true;
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
  worker.postMessage({type: "setSpeed", value: parseInt(document.getElementById("speed").value)});
	
	//save the rule
	if(document.getElementById("rule").value!==ruleMetadata.string&&document.getElementById("rule").value!==""){
		worker.postMessage({type:"setRule",args:document.getElementById("rule").value});
		isPlaying=false;
	}

	// //save step size
	if(document.getElementById("step").value){
		if(isNaN(document.getElementById("step").value)){
			alert("Genertions Per Update must be a number");
		}else{
			worker.postMessage({type:"stepSize",args:[parseInt(document.getElementById("step").value,10)]});
		}
	}

  setDark();
	//TODO: save the export rulestrings format
}

function zoom(deltaZoom, xFocus=0.5*canvasWidth, yFocus=0.5*canvasHeight, pastViewX=view.x, pastViewY=view.y, pastViewZ=view.z) {
	view.z=pastViewZ * deltaZoom;
	view.x=pastViewX + (xFocus-0.5*canvasWidth)*(deltaZoom-1)/(deltaZoom)/cellWidth/pastViewZ;
	view.y=pastViewY + (yFocus-0.5*canvasHeight)*(deltaZoom-1)/(deltaZoom)/cellWidth/pastViewZ;
	if(socket&&resetEvent===null)socket.emit("zoom", {id:clientId, zoom:view.z});

	updateCanvasColor();
}

//turn off lines if zoomed out significantly
//then change canvas tone to match
function updateCanvasColor(updateCanvas=false){
	if(detailedCanvas!==view.z > 0.2||updateCanvas){
    detailedCanvas = view.z > 0.2;
		if(detailedCanvas){
			canvas.style.backgroundColor=ruleMetadata.color[GRID.backgroundState][0];
		}else{
			//calculate average of main color and offset for hidden lines
			canvas.style.backgroundColor=ruleMetadata.color[GRID.backgroundState][0];
		}
	}
}

function move(x, y){
	if(pointers.length===0)return;
	//if 2 fingers are touching the canvas
	if(pointers.length>=2){
		//scale the grid
		let pastSpacing = distance(pointers[0].dragX-pointers[1].dragX,pointers[0].dragY-pointers[1].dragY);
		let currentSpacing = distance(pointers[0].x-pointers[1].x,pointers[0].y-pointers[1].y);
		zoom(currentSpacing/pastSpacing, 0.5*(pointers[0].dragX+pointers[1].dragX), 0.5*(pointers[0].dragY+pointers[1].dragY), view.touchX,view.touchY,view.touchZ);
	}else{
		if(pasteArea&&pasteArea.isWithinBounds(x,y)){
			pointers[0].objectBeingDragged=pasteArea.attemptDrag(x,y);
		}else if(GRID.type!==0&&GRID.finiteArea.isWithinBounds(x, y)){
			//select the grid edges if necessary
			console.log("in bounds?");
			pointers[0].objectBeingDragged=GRID.finiteArea.attemptDrag(x,y);
		}else{
			//translate the grid
			view.x=view.touchX+(pointers[0].deltaX)/cellWidth/view.z;
			view.y=view.touchY+(pointers[0].deltaY)/cellWidth/view.z;
			if(socket&&resetEvent===null)socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
		}
	}
	worker.postMessage({type:"move",view:{x:view.x, y:view.y, z:view.z}});
}

function select(x, y){
	// select an edge of the selectArea if the cursor is within the area
	if(selectArea&&selectArea.isWithinBounds(x,y)){
		pointers[0].objectBeingDragged=selectArea.attemptDrag(x,y);
	}else{
		//selects the previous marker fram the sparse markkers array
		//selects the last marker if the first is currently selected
		let previousMarker = null;
		for( let [index, marker] of Marker.list.entries())if(marker){
			if(marker.isWithinBounds(x,y)){
				if(previousMarker!==null&&marker===Marker.list[Marker.selectedIndex]) break;
				previousMarker=index;
			}
		}
		if(previousMarker!==null)Marker.selectedIndex=previousMarker;

		//if not clicking on a marker or selectArea, create a selectArea
		if(previousMarker===null&&selectArea===null){
			// make a selectArea if there are no selectable markers
			// this happens when the cursor clicks in an empty area.
			selectArea=new DraggableArea(y, x+1, y+1, x);
			pointers[0].objectBeingDragged=selectArea.attemptDrag(x, y);
		}
		setActionMenu();
	}
	render();
}

//function which renders graphics to the canvas
function renderPattern(pattern, x, y){
	let dx=Math.ceil(x)-view.x, dy=Math.ceil(y)-view.y, scaledCellWidth=cellWidth*view.z;

	//clear screen
	ctx.clearRect(0,0,canvasWidth,canvasHeight);

	if(darkMode){
		ctx.fillStyle="#FFFFFF";
	}else{
		ctx.fillStyle="#000000";
	}
	
	//TODO: fix rendering B0 rules with strobing enabled
	//draw for the pattern
	for(let i = 0; i < pattern.width; i++){
		for (let j = 0; j < pattern.height; j++) {
			if(GRID.backgroundState!==pattern[i][j]){
				ctx.fillStyle=getColor(pattern[i][j]);
				ctx.fillRect((i-30+30/view.z+dx)*scaledCellWidth,(j-20+20/view.z+dy)*scaledCellWidth,scaledCellWidth,view.z*cellWidth);
			}
		}
	}
}

//function which renders graphics to the canvas
function render(){
	countRenders++;
	renderPattern(visiblePattern, visiblePatternLocation.x, visiblePatternLocation.y);
	let x=view.x%1, y=view.y%1, scaledCellWidth=cellWidth*view.z;

	ctx.font = "20px Arial";

	if(isElementCheckedById("debugVisuals")===true){
		ctx.fillText(`view: ${Math.round(view.x * 100)/100} ${Math.round(view.touchX * 100)/100} ${Math.round(view.y*100)/100} ${Math.round(view.touchY *100)/100}`,10,15);
		ctx.fillText(countRenders+ ` renders`,10,30);
		//ctx.fillText(`${depthTotal/depthCount} hashnode depth`,10,45);
		ctx.fillText(`${ruleMetadata.size} rule nodes depth`,10,60);
		for (let i = 0; i < pointers.length; i++) {
			ctx.fillText(`cursor position: ${pointers[i].x} ${pointers[i].y}`,10,75+15*i);
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

	if(drawnCells.length>0&&isElementCheckedById("debugVisuals")===false){
		drawnCells.forEach((element) => {
			for (let i = 0; i < element.length; i++) {
				ctx.fillStyle=getColor(element[i].newState);
				ctx.fillRect(canvasWidth*0.5-((view.x-element[i].x)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-element[i].y)*cellWidth+canvasHeight*0.5)*view.z,view.z*cellWidth,view.z*cellWidth);
			}
		});
	}

	ctx.globalAlpha=0.25;
	//draw selected area
	if(selectArea){
		if(editMode===2&&selectArea.edgeBeingDragged!==0){
			if(darkMode){
				ctx.fillStyle="#555555";
			}else{
				ctx.fillStyle="#999999";
			}
		}else{
			if(darkMode){
				ctx.fillStyle="#333333";
			}else{
				ctx.fillStyle="#CCCCCC";
			}
		}
		ctx.fillRect(canvasWidth*0.5-((view.x-selectArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-selectArea.top)*cellWidth+canvasHeight*0.5)*view.z,(selectArea.right-selectArea.left)*scaledCellWidth-1,(selectArea.bottom-selectArea.top)*scaledCellWidth-1);
	}

	//draw paste
	if(pasteArea){
    if(darkMode){
      ctx.fillStyle="#333333";
    }else{
      ctx.fillStyle="#CCCCCC";
    }
		ctx.fillRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,pasteArea.pattern.width*scaledCellWidth-1,pasteArea.pattern.height*scaledCellWidth-1);

		ctx.globalAlpha=0.8;
		for(let h=0;h<pasteArea.pattern.width;h++){
			for(let i=0;i<pasteArea.pattern.height;i++){
				if(pasteArea.pattern[h][i]>0){
					//set the color
					ctx.fillStyle=getColor(pasteArea.pattern[h][i]);
					ctx.fillRect(canvasWidth*0.5-(canvasWidth*0.5+view.x*cellWidth)*view.z+(pasteArea.left+h)*scaledCellWidth,canvasHeight*0.5-(canvasHeight*0.5+view.y*cellWidth)*view.z+(pasteArea.top+i)*scaledCellWidth,scaledCellWidth,scaledCellWidth);
				}
			}
		}
	}
	
	for(let marker of Marker.list)if(marker){
		for(let h=0;h<marker.pattern.width;h++){
			for(let j=0;j<marker.pattern.height;j++){
				if(marker.pattern[h][j]>0){
					ctx.fillStyle=getColor(marker.pattern[h][j]);
					ctx.fillRect(canvasWidth*0.5-(canvasWidth*0.5+view.x*cellWidth)*view.z+(marker.left+h)*scaledCellWidth,canvasHeight*0.5-(canvasHeight*0.5+view.y*cellWidth)*view.z+(marker.top+j)*scaledCellWidth,scaledCellWidth,scaledCellWidth);
				}
			}
		}
	}
	ctx.globalAlpha=1;
	//if the toggle grid variable is true
	if(isElementCheckedById("gridLines")===true){
		//draw a grid
		if(darkMode){
			ctx.strokeStyle="#999999";
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
	//draws the active marker after the inactive markers
	for(let [index, marker] of Marker.list.entries())if(marker){
			if(marker!==Marker.list[Marker.selectedIndex]){
				if(darkMode){
					ctx.strokeStyle="#888888";
				}else{
					ctx.strokeStyle="#999999";
				}
			}else{
				if(darkMode){
					ctx.strokeStyle="#BBBBBB";
					ctx.fillStyle="#BBBBBB";
				}else{
					ctx.strokeStyle="#999999";
					ctx.fillStyle="#999999";
				}
				ctx.lineWidth=1;
				ctx.fillText("Marker "+(index+1),canvasWidth*0.5+1*view.z-((view.x-marker.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-6*view.z-((view.y-marker.top)*cellWidth+canvasHeight*0.5)*view.z,(marker.right-marker.left)*scaledCellWidth-1);
			}
			ctx.lineWidth=5*view.z;
		ctx.strokeRect(canvasWidth*0.5-((view.x-marker.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-marker.top)*cellWidth+canvasHeight*0.5)*view.z,(marker.right-marker.left)*scaledCellWidth-1,(marker.bottom-marker.top)*scaledCellWidth-1);
	}
	//draw a rectangle around the right-selectArea.
	if(selectArea){
		ctx.lineWidth=3*view.z;
		ctx.strokeStyle="#666666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-selectArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-selectArea.top)*cellWidth+canvasHeight*0.5)*view.z,(selectArea.right-selectArea.left)*scaledCellWidth-1,(selectArea.bottom-selectArea.top)*scaledCellWidth-1);
	}
	//draw a rectangle around the pattern to be pasted.
	if(pasteArea&&pasteArea.pattern[0]){
		ctx.lineWidth=3*view.z;
		ctx.strokeStyle="#666666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,pasteArea.pattern.width*scaledCellWidth-1,pasteArea.pattern.height*scaledCellWidth-1);
	}

	//draw the border of the finite grids
	if(GRID.type!==0){
		ctx.lineWidth=8*view.z;
		if(darkMode){
			ctx.strokeStyle="#888888";
		}else{
			ctx.strokeStyle="#999999";
		}
		ctx.strokeRect(canvasWidth*0.5-((view.x-GRID.finiteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-GRID.finiteArea.top)*cellWidth+canvasHeight*0.5)*view.z,(GRID.finiteArea.right-GRID.finiteArea.left)*scaledCellWidth-1,(GRID.finiteArea.bottom-GRID.finiteArea.top)*scaledCellWidth-1);
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

//TODO: replace 600:400 canvas with actual canvas dimensions and variable cell width
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
	pasteArea=null;
	if(activeClipboard===0)
		activeClipboard=parseInt(document.getElementById("copyMenu").previousElementSibling.innerText);
}

function submitFormat(self) {
  console.log(self.id);
	[...self.parentElement.children].forEach(element=>{
		if(element!==self)element.checked=false
	});
}

function getFormat(){
	const formats = ["BSG", "gbs", "sbg"];
	for(const format of formats)if(document.getElementById(format).checked)return format;
	throw new Error("no valid format found");
}

function importRLE(rleText){
	worker.postMessage({type:"import",args:rleText}).then((response) => {
		if(response === -1)return Promise.reject();
		if(response.writeDirectly){
			setView(...response.view);
		}else{
			activeClipboard=0;
			editMode=1;
			pasteArea=new ClipboardSlot(new Pattern(response.pattern),-Math.ceil(response.pattern.width/2),-Math.ceil(response.pattern.height/2));
      render();
			setActionMenu();
		}
		document.getElementById("rule").value=response.rule;
	}).catch((reason) => {
		console.log("Importing pattern from clipboard failed due to ", reason)
	});
}

function exportRLE(){
	return worker.postMessage({type:"export", ruleFormat:getFormat(), outputFormat:"RLE", inputPattern:selectArea??"Grid"});
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
	worker.postMessage({type:"sendEntireGrid", args: []});
	if(socket)socket.emit("rule", ruleMetadata.string);
});

if(socket)socket.on("relaySendGrid", msg => {
	console.log(msg);
	GRID.type=msg.type;
	if(GRID.type!==0){
		GRID.margin=msg.finite.margin;
		GRID.finiteArea.setSize(msg.finite);
    GRID.finiteArray=new Pattern(msg.data);
		console.log(GRID.finiteArray);
		console.log(GRID.finiteArea);
	}else{
		console.log(msg.data);
		if(msg.data[2].length>0)worker.postMessage({type:"write", args: [...msg.data]});
	}
});

if(socket)socket.on("deleteConnection", id => {
	delete clientList[id];
	render();
});

if(socket)socket.on("relayPan", msg => {
	clientList[msg.id].xPosition=msg.xPosition;
	clientList[msg.id].yPosition=msg.yPosition;
	render();
});

if(socket)socket.on("relayZoom", msg => {
	clientList[msg.id].zoom=msg.zoom;
	render();
});

if(socket)socket.on("relayDraw", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		for(let i=0;i<msg.length;i++){
			worker.postMessage({type:"write", args: [msg[i].x,msg[i].y,[[msg[i].newState]]]});
		}
	}else{
		for(let i=0;i<msg.length;i++){
			writePattern(msg[i].x,msg[i].y,[[msg[i].newState]],resetEvent);
		}
	}
	render();
});

if(socket)socket.on("relayUndoDraw", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		for(let i=0;i<msg.length;i++){
			worker.postMessage({type:"write", args: [msg[i].x,msg[i].y,[[msg[i].oldState]]]});
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
		worker.postMessage({type:"write", args: [...msg.newPatt]});
	}else{
		writePattern(...msg.newPatt, resetEvent);
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayUndoPaste", (time, msg) => {
	console.log(msg);
	if(resetEvent===null){
		worker.postMessage({type:"write", args: [...msg.oldPatt]});
	}else{
		writePattern(...msg.newPatt, resetEvent);
	}
	// TODO: replace render() here
});

if(socket)socket.on("relayRule", msg => {
	if(msg!==ruleMetadata.string){
		worker.postMessage({type:"setRule",args:msg});
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
