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

class Area {
  constructor(top=0, right=0, bottom=0, left=0){
    this.isActive=false;
    this.isBeingDragged=false;
    this.top=top;
    this.right=right;
    this.bottom=bottom;
    this.left=left;
    this.pointerRelativeX=0;
    this.pointerRelativeY=0;
    this.shipInfo={dx:null,dy:null,shipOffset:null,phases:[],period:0};
    this.pattern=[];
    this.previewBitmap=null;
  }
  
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
  
  moveEdgeTo(x, y){
		if(mod(edgeBeingDragged,3)===2){
      this.bottom=y+1;
			if(y<this.top){
				this.bottom=this.top+1;
				edgeBeingDragged+=2;
			}
			if(edgeBeingDragged===-1){
				if(x<this.left)edgeBeingDragged=-4;
				if(x>this.right)edgeBeingDragged=2;
			}
		}
		//drag left edgeBeingDragged
		if(edgeBeingDragged>=-4&&edgeBeingDragged<=-2){
			this.left=x;
			if(x>=this.right-1){
				this.left=this.right-1;
				edgeBeingDragged+=6;
			}
			if(edgeBeingDragged===-3){
				if(y<this.top)edgeBeingDragged=-2;
				if(y>this.bottom)edgeBeingDragged=-4;
			}
		}
		//drag top edgeBeingDragged
		if(mod(edgeBeingDragged,3)===1){
			this.top=y;
			if(y>=this.bottom-1){
				this.top=this.bottom-1;
				edgeBeingDragged-=2;
			}
			if(edgeBeingDragged===1){
				if(x<this.left)edgeBeingDragged=-2;
				if(x>this.right)edgeBeingDragged=4;
			}
		}
	//	//drag right edgeBeingDragged
		if(edgeBeingDragged>=2&&edgeBeingDragged<=4){
			this.right=x+1;
			if(x<this.left+1){
				this.right=this.left+1;
				edgeBeingDragged-=6;
			}
			if(edgeBeingDragged===3){
				if(y<this.top)edgeBeingDragged=4;
				if(y>this.bottom)edgeBeingDragged=2;
			}
		}
  }
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
				console.log(ruleMetadata);
				if(socket)socket.emit("rule", ruleMetadata.string);
				updateCanvasColor(true);
				break;
			case "render":
				visiblePattern = e.data.pattern;
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
            select area width: ${selectArea.right-selectArea.left}\n
            select area height: ${selectArea.bottom-selectArea.top}\n
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
	clipboard=Array.from({length: 6}, () => new Area()),
	//canvas context
	ctx=canvas.getContext("2d"),
	//this determines if the UI is using the dark theme.
	darkMode=1,
	//canvas fill color(0-dark,1-light)
	detailedCanvas=true,
	//ID of the thing being dragged(0=nothing,-4 to -1 and 4 to 4 for each corner)
	edgeBeingDragged=0,
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
		finiteArea:new Area(),
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
	//these are the 6 markers which can be placed on the grid
	markers=Array(6).fill().map(() => ({activeState:0,top:0,right:0,bottom:0,left:0,pattern:[],shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0}})),
	//list of mouse,pointers, touch instances, and other styluses
	pointers=[],
	//TODO: store dimensions as array and add getters for top, left, etc...
	//area containing the pattern to be pasted
	pasteArea=new Area(),
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
	selectArea=new Area(),
	//index of the marker being selected and interacted with
	selectedMarker=-1,
	//keeps track of when the last generation occurred
	timeOfLastGeneration=0,
	//position of the current view(x/y position,zoom)
	view={
		x:-30,y:-20,z:1,
		//position of the view for when a pointer clicks or touches
		touchX:0,touchY:0,touchZ:1,
	},
	visiblePattern=[[]],
	visiblePatternLocation={x:0,y:0},
	//set to true if the sim was reset in/before the current generation
	wasReset=false,
	//window and canvas dimensions
	windowHeight=0,windowWidth=0,canvasWidth=0,canvasHeight=0;

clipboard[1].pattern=[[1,0],[0,1]];
console.log(clipboard);

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

      selectArea.setSize(...area);
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

  //TODO: rewrite
	// if(resetEvent!==null)setEvent(resetEvent);
	text+="&draw="+drawMode;

	if(genCount!==0)text+="&gen="+genCount;

	if(GRID.backgroundState!==0)text+="&background="+GRID.backgroundState;

	const stepSize = parseInt(document.getElementById("step").value);
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

	if(ruleMetadata.string!=="B3/S23"){
		text+="&rule="+encodeURIComponent(ruleMetadata.string);
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

  //TODO: rewrite
	// if(resetEvent!==null)setEvent(currentEvent);
}

function drawCell(){
	//coordinates of the touched cell
	let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
	let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
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
    if(pasteArea.isActive){
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
    if(selectArea.isActive){
      //to randomize the select area
      editArea("randomize", selectArea);
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
  case 83: if(key[16])selectAll(); break;//s and shift
  case 84://t
    reset();
    resetActions();
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

	switch(editMode){
		case 0:
		drawnCells.push([]);
		drawCell();
    //get the cell state to be used for drawing from the worker [x, y]
		worker.postMessage({
			type:"writeCell",
			//TODO: reaname args to something less esoteric
			args:[
				Math.floor(((pointers[pointers.length - 1].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x),
				Math.floor(((pointers[pointers.length - 1].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y),
				drawnCells.length-1
			]
    //use the recieved cell state to set the state of any cells already drawn
		}).then((response) => {
      try{
        for(const cell of drawnCells[response.index])
          if(cell.newState===-1)cell.newState = response.state===0?drawMode:0;
        if(pointers.length===0)sendDrawnCells(drawnCells[response.index], response.index);
      }catch{}
		});
		break;
		case 1: move(); break;
		case 2: select(); break;
	}
}

canvas.onpointermove = (event) => {
	const index = pointers.findIndex((p) => p.id === event.pointerId);
  //TODO: add ability to draw while the rule (eg. history) is loading
	if(pointers.length>0){
		pointers[index].x=event.clientX - canvas.getBoundingClientRect().left;
		pointers[index].y=event.clientY - canvas.getBoundingClientRect().top;
		switch(editMode){
			case 0: drawCell(); break;
			case 1: move(); break;
			case 2: select(); break;
		}
	}
}

canvas.onpointerup = (event) => {
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
	if(GRID.finiteArea.isBeingDragged){
		let resizedArray=new Array(GRID.finiteArea.right-GRID.finiteArea.left+(GRID.type===1?2:0));
		for(let i=0; i<resizedArray.length;i++){
			resizedArray[i]=new Array(GRID.finiteArea.bottom-GRID.finiteArea.top+(GRID.type===1?2:0));
			for(let j=0; j<resizedArray[0].length;j++){
				if(i>=GRID.finiteArea.left-GRID.finiteArea.left+GRID.margin&&i<GRID.finiteArea.left-GRID.finiteArea.left+GRID.finiteArray.length-GRID.margin&&j>=GRID.finiteArea.top-GRID.finiteArea.top+GRID.margin&&j<GRID.finiteArea.top-GRID.finiteArea.top+GRID.finiteArray[0].length-GRID.margin){
					resizedArray[i][j]=GRID.finiteArray[i+GRID.finiteArea.left-GRID.finiteArea.left][j+GRID.finiteArea.top-GRID.finiteArea.top];
				}else{
					resizedArray[i][j]=GRID.backgroundState;
				}
			}
		}
		GRID.finiteArray=resizedArray;
	}

	//keeps track of select area edges
	edgeBeingDragged = 0;
  selectArea.isBeingDragged=false;
  GRID.finiteArea.isBeingDragged=false;
  pasteArea.isBeingDragged=false;

	//reset the markers
	selectedMarker=-1;
  //TODO: may be superfluous after changing the drag mechanics
	if(selectArea.left===selectArea.right||selectArea.top===selectArea.bottom){
		selectArea.isActive=false;
		setActionMenu();
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
	if(pasteArea.isActive){
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
	console.log("set move mode");
}

//swith to select mode
function setSelectMode(){
	if(selectArea.isActive===true&&editMode===2)selectArea.isActive=false;
	resetClipboard();
	setActionMenu();
	editMode=2;
	captureScroll=true;
	render();
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
	const cellWidth = 200/(pattern.length);
	const canvasWidth=200, canvasHeight=Math.ceil(cellWidth*(pattern[0].length));
	const offscreenCanvas = new OffscreenCanvas(canvasWidth,canvasHeight);
	const context = offscreenCanvas.getContext("2d");
	context.scale(1,1);

	if(darkMode){
		context.strokeStyle="#999999";
	}else{
		context.strokeStyle="#000000";
	}

	for(let i=0;i<pattern.length;i++){
		for(let j=0;j<pattern[i].length;j++){
			context.fillStyle=getColor(pattern[i][j]);
			context.fillRect(i*cellWidth,j*cellWidth,1*cellWidth,1*cellWidth);
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
	
	if(!isPlaying)render();
}

function duplicateLastChild(element){
	element.appendChild(element.lastElementChild.cloneNode(true));
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
				paste();
				//TODO: update collaboration features
				// if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
			}
		}
	},{
		name: "Randomize",
		action: (element) => {
			if(selectArea.isActive&&element.children[2].children[0].innerHTML==="Select Area"){
				editArea("randomize",selectArea);
			}else if(element.children[2].children[0].innerHTML.includes("Marker")){
				const marker=markers[parseInt(element.children[2].children[0].innerHTML[7])-1];
				if(marker.activeState!==0)editArea("randomize",marker);
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
        //TODO: replace with editArea("increment");
				editArea("increment", selectArea);
			}else if(element.children[2].children[0].innerHTML.includes("Marker")){
				const marker=markers[parseInt(element.children[2].children[0].innerHTML[7])-1];
        //TODO: replace with editArea("increment");
				if(marker.activeState!==0)editArea("increment", marker);
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
	render();
}

function changeGridType(target){
	let dropdown = target.parentElement;

	let targetIndex = Array.from(dropdown.children).indexOf(target);
	console.log("change GRID");
	worker.postMessage({type:"setGrid", grid: targetIndex}).then((response) => {
		GRID.type=targetIndex;
		GRID.margin=targetIndex===1?1:0;
		GRID.finiteArea.top = response[3];
		//                      leftSidePos + pattern width - 2*margin
		GRID.finiteArea.right = response[2] + response[0].length;
		//                      topSidePos + pattern height - 2*margin
		GRID.finiteArea.bottom = response[3] + response[0][0].length;
		GRID.finiteArea.left = response[2];
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
  pasteArea.isActive=false;
  selectArea.isActive=true;
  setActionMenu();
  worker.postMessage({type: "getBounds"}).then((response) => {
    selectArea.setSize(...response)  });
  render();
}

function editArea(action, area=selectArea){
	if(pasteArea.isActive){
		resetClipboard();
	}else if(selectArea.isActive===true){
    console.log(area);
    worker.postMessage({type:action, area:area, drawMode:drawMode, clipboard:activeClipboard, randomFillPercent:document.getElementById("density").value/100}).then((response) => {
      if(action==="copy"||action==="cut"){
        clipboard[activeClipboard].pattern=response;
        clipboard[activeClipboard].previewBitmap=patternToBitmap(clipboard[activeClipboard].pattern);
        pasteArea.top=selectArea.top;
        pasteArea.left=selectArea.left;
        clipboard[activeClipboard].shipInfo={dx:null,dy:null,phases:[],period:0};
        selectArea.isActive=false;
      }
			render();
    });
		setActionMenu();
		render();
	}
}

function paste(){
	captureScroll=true;
	if(clipboard[activeClipboard]&&clipboard[activeClipboard].pattern.length!==0){
		if(pasteArea.isActive){
			worker.postMessage({type:"write", args: [pasteArea.left,pasteArea.top,activeClipboard]});
			//TODO: reimplement this
			// if(socket&&resetEvent===null)socket.emit("paste", Date.now(), currentEvent.paste);
		}else{
			selectArea.isActive=false;
			pasteArea.isActive=true;
			editMode=1;
			render();
		}
		setActionMenu();
	}
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
	worker.postMessage({type:"transformClippedPattern", pattern:newPattern, clipboard:activeClipboard});
	clipboard[activeClipboard].previewBitmap=patternToBitmap(clipboard[activeClipboard].pattern);
	render();
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
				markers[h].pattern=clipboard[activeClipboard].pattern;
				markers[h].activeState=1;
				markers[h].top=pasteArea.top;
				markers[h].right=pasteArea.left+clipboard[activeClipboard].pattern.length;
				markers[h].bottom=pasteArea.top+clipboard[activeClipboard].pattern[0].length;
				markers[h].left=pasteArea.left;
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
	worker.postMessage({type:"reset",args:[]});
	wasReset=true;
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
	render();
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

function move(){
	if(pointers.length===0)return;
	//coordinates of the touched cell
	let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
	let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);

	//if 2 fingers are touching the canvas
	if(pointers.length>=2){
		//scale the grid
		let pastSpacing = distance(pointers[0].dragX-pointers[1].dragX,pointers[0].dragY-pointers[1].dragY);
		let currentSpacing = distance(pointers[0].x-pointers[1].x,pointers[0].y-pointers[1].y);
		zoom(currentSpacing/pastSpacing, 0.5*(pointers[0].dragX+pointers[1].dragX), 0.5*(pointers[0].dragY+pointers[1].dragY), view.touchX,view.touchY,view.touchZ);
	}else{
    if(pasteArea.isBeingDragged){
      pasteArea.left=x-pasteArea.pointerRelativeX;
      pasteArea.top=y-pasteArea.pointerRelativeY;
    }else if(GRID.finiteArea.isBeingDragged){
      console.log(x, y);
      GRID.finiteArea.moveEdgeTo(x, y);
    }else{
      if(pasteArea.isActive&&clipboard[activeClipboard]&&x>=pasteArea.left&&x<pasteArea.left+clipboard[activeClipboard].pattern.length&&y>=pasteArea.top&&y<pasteArea.top+clipboard[activeClipboard].pattern[0].length){
        pasteArea.isBeingDragged=true;
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
          GRID.finiteArea.isBeingDragged=true;
          isPlaying=false;
        }else if(x>Math.max(GRID.finiteArea.right-4/view.z,(GRID.finiteArea.right+GRID.finiteArea.left)/2)){
          edgeBeingDragged=1;
          GRID.finiteArea.isBeingDragged=true;
          isPlaying=false;
        }
        if(y<Math.min(GRID.finiteArea.top+4/view.z,(GRID.finiteArea.bottom+GRID.finiteArea.top)/2)){
          edgeBeingDragged=4;
          GRID.finiteArea.isBeingDragged=true;
          isPlaying=false;
        }else if(y>Math.max(GRID.finiteArea.bottom-4/view.z,(GRID.finiteArea.bottom+GRID.finiteArea.top)/2)){
          edgeBeingDragged=2;
          GRID.finiteArea.isBeingDragged=true;
          isPlaying=false;
        }
      }else{
        //translate the grid
        view.x=view.touchX+(pointers[0].deltaX)/cellWidth/view.z;
        view.y=view.touchY+(pointers[0].deltaY)/cellWidth/view.z;
        if(socket&&resetEvent===null)socket.emit("pan", {id:clientId, xPosition:view.x, yPosition:view.y});
      }
    }
	}
	worker.postMessage({type:"move",view:{x:view.x, y:view.y, z:view.z}});
}

function select(){
	//coordinates of the touched cell
	let x=Math.floor(((pointers[0].x-canvasWidth*0.5)/view.z+canvasWidth*0.5)/cellWidth+view.x);
	let y=Math.floor(((pointers[0].y-canvasHeight*0.5)/view.z+canvasHeight*0.5)/cellWidth+view.y);
	// select an edge of the selectArea if the cursor is within the area
	// the marigin for selecting is increased on the left and right if
	// the area is narrower than 4/view.z, and likewise for the
	// top and bottom.
	if(selectArea.isActive===true&&edgeBeingDragged===0&&x>=selectArea.left-1-Math.max(0,4/view.z+selectArea.left-selectArea.right)&&x<selectArea.right+1+Math.max(0,4/view.z+selectArea.left-selectArea.right)&&y>=selectArea.top-1-Math.max(0,4/view.z+selectArea.top-selectArea.bottom)&&y<selectArea.bottom+1+Math.max(0,4/view.z+selectArea.top-selectArea.bottom)){
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
		if(x<Math.min(selectArea.left+4/view.z,(selectArea.right+selectArea.left)/2)){
			edgeBeingDragged=-3;
			isPlaying=false;
		}else if(x>Math.max(selectArea.right-4/view.z,(selectArea.right+selectArea.left)/2)){
			edgeBeingDragged=3;
			isPlaying=false;
		}
		if(y<Math.min(selectArea.top+4/view.z,(selectArea.bottom+selectArea.top)/2)){
			edgeBeingDragged+=1;
			isPlaying=false;
		}else if(y>Math.max(selectArea.bottom-4/view.z,(selectArea.bottom+selectArea.top)/2)){
			edgeBeingDragged-=1;
			isPlaying=false;
		}
		//deselect all markers
		for(let h=0;h<markers.length;h++){
			if(markers[h].activeState===2)markers[h].activeState=1;
		}
	}else if(selectArea.isActive===true&edgeBeingDragged!==0){
		//drag bottom edge
    selectArea.moveEdgeTo(x, y);
	}else{
		//marker[#].activestate:
		//0 = inactive, not visible,
		//1 = active, visible
		//2 = selected, visible with strong outline
		//selectedmarker:
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
			selectArea.top = y;
			selectArea.right = x+1;
			selectArea.bottom = y+1;
			selectArea.left = x;
		}
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
	for(let i = 0; i < pattern.length; i++){
		for (let j = 0; j < pattern[0].length; j++) {
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
	if(selectArea.isActive===true){
		if(editMode===2&&edgeBeingDragged!==0){
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
	if(pasteArea.isActive&&clipboard[activeClipboard].pattern[0]){
    if(darkMode){
      ctx.fillStyle="#333333";
    }else{
      ctx.fillStyle="#CCCCCC";
    }
		ctx.fillRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,clipboard[activeClipboard].pattern.length*scaledCellWidth-1,clipboard[activeClipboard].pattern[0].length*scaledCellWidth-1);
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
	//draw a rectangle around each marker
	for(let h=0;h<2;h++){
		for(let i=0;i<markers.length;i++){
			if(markers[i].activeState!==0){
				if(markers[i].activeState===1){
					if(darkMode){
						ctx.strokeStyle="#888888";
					}else{
						ctx.strokeStyle="#999999";
					}
				}else if(markers[i].activeState===2){
					if(darkMode){
						ctx.strokeStyle="#BBBBBB";
						ctx.fillStyle="#BBBBBB";
					}else{
						ctx.strokeStyle="#999999";
						ctx.fillStyle="#999999";
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
		ctx.strokeStyle="#666666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-selectArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-selectArea.top)*cellWidth+canvasHeight*0.5)*view.z,(selectArea.right-selectArea.left)*scaledCellWidth-1,(selectArea.bottom-selectArea.top)*scaledCellWidth-1);
	}
	//draw a rectangle around the pattern to be pasted.
	if(pasteArea.isActive&&clipboard[activeClipboard].pattern[0]){
		ctx.lineWidth=3*view.z;
		ctx.strokeStyle="#666666";
		ctx.strokeRect(canvasWidth*0.5-((view.x-pasteArea.left)*cellWidth+canvasWidth*0.5)*view.z,canvasHeight*0.5-((view.y-pasteArea.top)*cellWidth+canvasHeight*0.5)*view.z,clipboard[activeClipboard].pattern.length*scaledCellWidth-1,clipboard[activeClipboard].pattern[0].length*scaledCellWidth-1);
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
	pasteArea.isActive=false;
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
		if("type" in response){
			document.getElementById("rule").value=response.rule;
		}else{//if response is just the pattern
			activeClipboard=0;
			clipboard[activeClipboard].pattern=response;
			editMode=1;
			pasteArea.isActive=true;
			pasteArea.left=-Math.ceil(response.length/2);
			pasteArea.top=-Math.ceil(response[0].length/2);
      render();
			setActionMenu();
		}
	});
}

function exportRLE(){
	// return patternToRLE(exportPattern().pattern);
	worker.postMessage({type:"export", ruleFormat:getFormat(), textFormat:"RLE", sourcePattern:selectArea.isActive?selectArea:"Grid"})
		.then((response) => document.getElementById('rle').value=response);
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
	if(socket)socket.emit("rule", ruleMetadata.string);
});

if(socket)socket.on("relaySendGrid", msg => {
	console.log(msg);
	GRID.type=msg.type;
	if(GRID.type!==0){
		GRID.margin=msg.finite.margin;
		GRID.finiteArea.setSize(msg.finite);
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
	if(msg!==ruleMetadata.string){
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
