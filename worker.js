class TreeNode {
	constructor(distance){
		this.distance=distance;
		this.value=null;
		this.key=null;
		this.child = [null,null,null,null];
		this.result = null;
		this.depth = null;
		this.nextHashedNode=null;
		this.population = 0;
	}
}

class Area {
  constructor(top, right, bottom, left){
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
  }
}

class EventNode {
	constructor(parent){
		this.parent=parent;
		if(parent!==null)parent.child=this;
		this.child=null;
		this.action="unknown";
		if(arguments.length<=2){
			this.rule=ruleMetadata.string;
			if(GRID.type===0){
				this.head=GRID.head;
			}else{
				this.finiteArea={left:GRID.finiteArea.left, top:GRID.finiteArea.top, margin:GRID.finiteArea.margin};
				this.finiteArray=patternToRLE(GRID.finiteArray, "gbs");
			}
			this.type=GRID.type;
			this.backgroundState=GRID.backgroundState;
			this.generation=genCount;
			this.resetEvent=resetEvent;
			this.time=Date.now();
			//save the name of the action if provided as the 2nd argument
			if(arguments[1])this.action=arguments[1];
		}else{
			for(let i=2;i<arguments.length;i+=2){
				const name=arguments[i],data=arguments[i+1];
				if(name.indexOf("draw")!==-1){
					this.draw=data;
				}
				if(name.indexOf("paste")!==-1){
					this.paste=data;
				}
				this.action=name;
				console.log(name);
			}
			this.time=arguments[1];
		}
	}
}

var 
	//copy paste clipboard
	clipboard=Array(3).fill().map(() => ({pattern:[],shipInfo:{dx:null,dy:null,shipOffset:null,phases:[],period:0},previewBitmap:null})),
	//total depth of nodes being read from the hashtable
	depthTotal=0,
	//number of depths added to total, used to calculate average
	depthCount=0,
	//state currently being drawn
	drawnState=-1,
	//list of empty nodes with different states for B0.
	emptyNodes=[],
	//state of the grid
	GRID={
		//which kind of grid is being used
		type:0,//0=infinite,1=finite,2=toroidal
		//data for the cells on an infinte grid
		head:null,
		//data for the cells on a finite grid
		finiteArray:[],
		//area representing a finite portion of the grid
		finiteArea:{margin:0,top:0,right:0,bottom:0,left:0,newTop:1,newRight:0,newBottom:0,newLeft:0},
		//state of the background(used for B0 rules)
		backgroundState:0
	},
	//time elapsed
	genCount=0,
	//finite population
	gridPopulation=0,
	//hashtable for storing node of the quadtree
	hashTable=new Array(999953),
	//use to calculate depth of nodes being read from the hashtable
	hashTableDepths=[],
	//max depth for traversing trees
	maxDepth=20000,
	//metric of the number of nodes in the hashtable
	numberOfNodes=0,
	pasteArea={isActive:false,top:0,left:0,pointerRelativeX:0,pointerRelativeY:0},
	//point where the simulator resets to
	resetEvent=null,
	//rule stored internally as an n-tree for a n state rule
	rule,
	//number of nodes in the rule, rule family(INT, Generations, History), color of each state, rulestring
	ruleMetadata={size:0, family:"INT", color:[], string:"B3/S23"},
  //the current search
  searchOptions=[],
  //speed of the simulation 1-100
  simulationSpeed = 100;
	//number of genertions updated
	stepSize=1,
	//current view of the user
	view={x:-30,y:-20,z:1};

let finishedLoading = false;

parseRulestring("B3/S23");
GRID.head=writeNode(getEmptyNode(8));
let currentEvent=new EventNode(null,"start");

sendVisibleCells();

finishedLoading = true;

function mod(num1,num2){
	return (num1%num2+num2)%num2;
}

function distance(num1, num2){
	return Math.sqrt(num1*num1+num2*num2);
}

function new2dArray(width, height, fill=0){
	try{
		return new Array(width).fill(null).map(()=>Array(height).fill(fill));
	}catch(error){
		console.log(width, height, error);
		return [[]];
	}
}

function calculateKey(node){
	//sets key to the nodes value if it has one
	if(node.distance===1){
		node.key=node.value;
		node.population=node.value===1?1:0;
		//otherwise sets the key based of the children's keys
	}else{
		node.key=rule.length;
		node.population=0;
		const primes=[7,1217,7919,104729];
		for(let h=0;h<4;h++) if(node.child[h]!==null){
			if(node.child[h].key===null){
				calculateKey(node.child[h]);
			}
			node.key=(node.key^(node.child[h].key*primes[h]));
			node.population+=node.child[h].population;
		}
	}
}

function getEmptyNode(distance){
	if(emptyNodes[GRID.backgroundState]&&emptyNodes[GRID.backgroundState].distance===distance)return emptyNodes[GRID.backgroundState];
	let node=new TreeNode(distance);
	node.value=GRID.backgroundState;
	if(distance===1)return writeNode(node);
	node.child[0]=getEmptyNode(distance>>>1);
	node.child[1]=node.child[0];
	node.child[2]=node.child[1];
	node.child[3]=node.child[2];
	return writeNode(node);
}

function iteratePattern(array,top,right,bottom,left){
	const lookupTable1=[1,-1,-1,1,0,-1,1,0,0], lookupTable2=[-1,-1,1,1,-1,0,0,1,0];

	let result=new Array(right-left);
	for(let i = left; i < right; i++){
		result[i-left]=new Array(bottom-top);
		for(let j = top; j < bottom; j++){
			let node = rule;
			for(let k = 0;k<9;k++){
				node=node[array[mod(i+lookupTable1[k],array.length)][mod(j+lookupTable2[k],array[0].length)]];
			}
			result[i-left][j-top]=node;
		}
	}
	return result;
}

function getCellValue(startNode,xPos,yPos){
	let node=startNode,relativeX=xPos*2,relativeY=yPos*2;
	for(let h=0;;h++){
		if(h>maxDepth){
			console.log(`maxDepth of ${maxDepth} reached.`);
			break;
		}
		if(relativeY<0){
			if(relativeX<0){
				if(node.child[0]&&relativeX>=-node.distance&&relativeY>=-node.distance){
					node=node.child[0];
					relativeX+=node.distance;
					relativeY+=node.distance;
					if(node.distance===1){
						return node.value;
					}
				}else{
					return GRID.backgroundState;
				}
			}else{
				if(node.child[1]&&relativeX<node.distance&&relativeY>=-node.distance){
					node=node.child[1];
					relativeX-=node.distance;
					relativeY+=node.distance;
					if(node.distance===1){
						return node.value;
					}
				}else{
					return GRID.backgroundState;
				}
			}
		}else{
			if(relativeX<0){
				if(node.child[2]&&relativeX>=-node.distance&&relativeY<node.distance){
					node=node.child[2];
					relativeX+=node.distance;
					relativeY-=node.distance;
					if(node.distance===1){
						return node.value;
					}
				}else{
					return GRID.backgroundState;
				}
			}else{
				if(node.child[3]&&relativeX<node.distance&&relativeY<node.distance){
					node=node.child[3];
					relativeX-=node.distance;
					relativeY-=node.distance;
					if(node.distance===1){
						return node.value;
					}
				}else{
					return GRID.backgroundState;
				}
			}
		}
	}
}

function gen(gridObj){
	//record that a generation was run
	genCount++;

	let newBackgroundState;

	//the newBackgroundState variable is necessary because doubleSize() uses emptyNode(gridObj.backgroundState)
	if(gridObj.backgroundState===0&&rule[0][0][0][0][0][0][0][0][0]===1){
		newBackgroundState=1;
	}else if(gridObj.backgroundState===1){
		newBackgroundState=rule[1][1][1][1][1][1][1][1][1];
	}else if(gridObj.backgroundState===rule.length-1){
		newBackgroundState=0;
	}else if(gridObj.backgroundState>1){
		newBackgroundState=gridObj.backgroundState+1;
	}else{
		newBackgroundState=gridObj.backgroundState;
	}

	let toBeExtended = false;
	if(gridObj.type===0){
		for(let i = 0;i < 4;i++){
			for(let j = 0;j < 4;j++){
				if(i!==3-j&&gridObj.head.child[i].result.child[j].value!==newBackgroundState){
					toBeExtended=true;
					break;
				}
			}
			if(toBeExtended===true)break;
		}

		//top
		let temporaryNode=new TreeNode(gridObj.head.distance>>>1);
		temporaryNode.child[0]=gridObj.head.child[0].child[1];
		temporaryNode.child[1]=gridObj.head.child[1].child[0];
		temporaryNode.child[2]=gridObj.head.child[0].child[3];
		temporaryNode.child[3]=gridObj.head.child[1].child[2];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		if(temporaryNode.result.child[0].value!==newBackgroundState)toBeExtended=true;
		if(temporaryNode.result.child[1].value!==newBackgroundState)toBeExtended=true;


		//right
		temporaryNode=new TreeNode(gridObj.head.distance>>>1);
		temporaryNode.child[0]=gridObj.head.child[1].child[2];
		temporaryNode.child[1]=gridObj.head.child[1].child[3];
		temporaryNode.child[2]=gridObj.head.child[3].child[0];
		temporaryNode.child[3]=gridObj.head.child[3].child[1];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		if(temporaryNode.result.child[1].value!==newBackgroundState)toBeExtended=true;
		if(temporaryNode.result.child[3].value!==newBackgroundState)toBeExtended=true;


		//bottom
		temporaryNode=new TreeNode(gridObj.head.distance>>>1);
		temporaryNode.child[0]=gridObj.head.child[2].child[1];
		temporaryNode.child[1]=gridObj.head.child[3].child[0];
		temporaryNode.child[2]=gridObj.head.child[2].child[3];
		temporaryNode.child[3]=gridObj.head.child[3].child[2];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		if(temporaryNode.result.child[3].value!==newBackgroundState)toBeExtended=true;
		if(temporaryNode.result.child[2].value!==newBackgroundState)toBeExtended=true;


		//left
		temporaryNode=new TreeNode(gridObj.head.distance>>>1);
		temporaryNode.child[0]=gridObj.head.child[0].child[2];
		temporaryNode.child[1]=gridObj.head.child[0].child[3];
		temporaryNode.child[2]=gridObj.head.child[2].child[0];
		temporaryNode.child[3]=gridObj.head.child[2].child[1];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		if(temporaryNode.result.child[2].value!==newBackgroundState)toBeExtended=true;
		if(temporaryNode.result.child[0].value!==newBackgroundState)toBeExtended=true;

		if(toBeExtended===true)gridObj.head=doubleSize(gridObj.head);
		gridObj.backgroundState=newBackgroundState;

		let newGen=new TreeNode(gridObj.head.distance);

		if(!emptyNodes[gridObj.backgroundState]){
			emptyNodes[gridObj.backgroundState]=getEmptyNode(gridObj.head.distance>>2);
		}

		for(let i = 0;i < 4;i++){
			newGen.child[i]=new TreeNode(gridObj.head.distance>>>1);

			for(let j = 0;j < 4;j++){
				if(i === 3 - j){
					newGen.child[i].child[j]=gridObj.head.result.child[i];
				}else{
					newGen.child[i].child[j]=emptyNodes[gridObj.backgroundState];
				}
			}
			newGen.child[i].value=getValue(newGen.child[i]);
			newGen.child[i]=writeNode(newGen.child[i]);
		}

		newGen.value=getValue(newGen);
		gridObj.head=writeNode(newGen);
	}else if(gridObj.type>0){
		const margin=gridObj.type===1?1:0;
		const nextGeneration=
			iteratePattern(gridObj.finiteArray,margin,
				gridObj.finiteArray.length-margin,
				gridObj.finiteArray[0].length-margin,margin);
		
		gridPopulation=0;
		for (let i = 0; i < gridObj.finiteArray.length; i++) {
			for (let j = 0; j < gridObj.finiteArray[0].length; j++) {
				if(j>=gridObj.finiteArea.margin&&i<gridObj.finiteArray.length-gridObj.finiteArea.margin&&j<gridObj.finiteArray[0].length-gridObj.finiteArea.margin&&i>=gridObj.finiteArea.margin){
					gridObj.finiteArray[i][j]=nextGeneration[i-gridObj.finiteArea.margin][j-gridObj.finiteArea.margin];
				}else{
					gridObj.finiteArray[i][j]=newBackgroundState;
				}
				if(gridObj.finiteArray[i][j]!==newBackgroundState)gridPopulation++;
			}
		}
		gridObj.backgroundState=newBackgroundState;
	}
	//document.getElementById("numberOfNodes").innerHTML=numberOfNodes;
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

function readPatternFromTree(area, tree){
  if(area.right-area.left<0)throw new Error("trying to read negative width");
  if(area.bottom-area.top<0)throw new Error("trying to read negative height");
  let pattern = new2dArray(area.right-area.left, area.bottom-area.top, GRID.backgroundState);
	let stack = new Array(tree.head.distance.toString(2).length);
	stack[0]={node:tree.head, direction:0, dist: tree.head.distance*0.25, x:-area.left-0.5,y:-area.top-0.5};
	let depth=0;
	for(let i = 0; ; i++){
		if(i === Number.MAX_SAFE_INTEGER){
			console.log(`number of nodes exceeds ${Number.MAX_SAFE_INTEGER}.`);
		}
		// console.log(stack[depth].direction, depth, stack[depth].x, stack[depth].y, visitedNodes[depth].distance/2, stack[depth].node.value);
		if(stack[depth].node.distance===1){
			pattern[stack[depth].x][stack[depth].y]=stack[depth].node.value;
			stack[--depth].direction++;
		}else if(stack[depth].direction<4){
			if((stack[depth].y>0||stack[depth].direction>1)
			 &&(stack[depth].x<pattern.length-1||stack[depth].direction%2===0)
			 &&(stack[depth].y<pattern[0].length-1||stack[depth].direction<=1)
			 &&(stack[depth].x>0||stack[depth].direction%2===1)){
				stack[depth+1]={
					node:stack[depth].node.child[stack[depth].direction], direction:0, dist: stack[depth].dist*0.5,
					x:stack[depth].x-stack[depth].dist*(1-2*(stack[depth].direction%2)),
					y:stack[depth].y-stack[depth].dist*(1-2*(stack[depth].direction>1))};
				depth++;
			}else{
				stack[depth].direction++;
			}
		}else{
			if(depth===0){
				// console.log("done in ", i, " iterations.");
				break;
			}
			stack[--depth].direction++;
		}
	}
	//end
	return pattern;
}


function readPattern(area){
	let pattern=new Array(area.right-area.left);
	if(GRID.type===0){
		return readPatternFromTree(area, GRID);
	}else{
		const finiteGrid=(arguments[4]!==undefined)?arguments[4].finiteArray:GRID.finiteArray;
		const finiteGridMargin=(arguments[4]!==undefined)?arguments[4].finiteArea.margin:GRID.finiteArea.margin;
		const finiteGridLeft=(arguments[4]!==undefined)?arguments[4].finiteArea.left:GRID.finiteArea.left;
		const finiteGridTop=(arguments[4]!==undefined)?arguments[4].finiteArea.top:GRID.finiteArea.top;
		for(let i=0;i<pattern.length;i++){
			pattern[i]=new Array(area.bottom-area.top);
			for(let j=0;j<pattern[i].length;j++){
				if(j+area.top>=finiteGridTop-finiteGridMargin&&i+area.right<finiteGridLeft+finiteGrid.length+finiteGridMargin&&j+area.top<finiteGridTop+finiteGrid[0].length+finiteGridMargin&&i+area.left>=finiteGridLeft-finiteGridMargin){
					pattern[i][j]=finiteGrid[i-finiteGridLeft+finiteGridMargin+area.left][j-finiteGridTop+finiteGridMargin+area.top];
				}else{
					pattern[i][j]=arguments[4]?0:GRID.backgroundState;
				}
			}
		}
	}
	return pattern;
}

function expandGridToCell(x,y){
	for(let h=0;;h++){
		if(h>maxDepth){
			console.log(`maxDepth of ${maxDepth} reached.`);
			break;
		}
		if(GRID.head.distance<=Math.abs(4*x)||GRID.head.distance<=Math.abs(4*y)||GRID.head.distance<8){//extends early in some directions
			GRID.head=doubleSize(GRID.head);
		}else{
			break;
		}
	}
}

function writeCell(x,y,state){
	let sumX=0, sumY=0;
	let progress=[], visitedNodes=[];
	//if the grid is infinite
	if(GRID.type===0){
		expandGridToCell(x, y);
		let node=GRID.head;
		for(let h=0;; h++){
			if(h>maxDepth){
				console.log(`maxDepth of ${maxDepth} reached.`);
				break;
			}
			if(y*2<sumY){
				if(x*2<sumX){
          progress.push(0)
					visitedNodes.push(node);
					node=node.child[0];
					sumX-=node.distance;
					sumY-=node.distance;
					if(node.distance===1){
						break;
					}
				}else{
          progress.push(1)
					visitedNodes.push(node);
					node=node.child[1];
					sumX+=node.distance;
					sumY-=node.distance;
					if(node.distance===1){
						break;
					}
				}
			}else{
				if(x*2<sumX){
          progress.push(2)
					visitedNodes.push(node);
					node=node.child[2];
					sumX-=node.distance;
					sumY+=node.distance;
					if(node.distance===1){
						break;
					}
				}else{
          progress.push(3)
					visitedNodes.push(node);
					node=node.child[3];
					sumX+=node.distance;
					sumY+=node.distance;
					if(node.distance===1){
						break;
					}
				}
			}
		}
		if(node!==null){
			// if(node.value===null)node.value=0;
			// if(state===-1){
			// 	//if the cursor begins to draw set the state
			// 	if(drawnState=== -1){
			// 		isPlaying=0;
			// 		if(node.value===rule.length-1){
			// 			//set cell state to live(highest state)
			// 			drawnState=0;
			// 		}else{
			// 			//otherwise set cell state to zero
			// 			drawnState=node.value+1;
			// 		}
			// 	}
			// }else{
			// 	//if the cursor begins to draw set the state
			// 	if(drawnState=== -1){
			// 		isPlaying=0;
			// 		if(node.value===state){
			// 			//set cell state to live(highest state)
			// 			drawnState=0;
			// 		}else{
			// 			//otherwise set cell state to zero
			// 			drawnState=state;
			// 		}
			// 	}
			// 	isPlaying=0;
			// }

			if(node.value!==state){
				//make a copy of the node with the new state
				let newNode=new TreeNode(1);
				newNode.value=state;

				//go through the edited node and all the parents
				for(let h=progress.length-1;h>=0;h--){
					if(h>maxDepth){
						console.log(`maxDepth of ${maxDepth} reached.`);
						break;
					}
					newNode=writeNode(newNode);
          
					//make a copy of the parent node
					let parentNode=new TreeNode(visitedNodes[h].distance);
					for(let i=0;i<4;i++){
						if(i===progress[h]){
							parentNode.child[i]=newNode;
						}else{
							parentNode.child[i]=visitedNodes[h].child[i];
						}
					}
					newNode=writeNode(parentNode);
				}
        GRID.head=newNode;
			}
		}
		return node.value;
	}else{
		if(x>=GRID.finiteArea.left&&x<GRID.finiteArea.right&&y>=GRID.finiteArea.top&&y<GRID.finiteArea.bottom){
			// if(state===-1){
			// 	//if the cursor begins to draw set the state
			// 	if(drawnState=== -1){
			// 		isPlaying=0;
			// 		if(GRID.finiteArray[x-GRID.finiteArea.left+GRID.finiteArea.margin][y-GRID.finiteArea.top+GRID.finiteArea.margin]===rule.length-1){
			// 			//set cell state to live(highest state)
			// 			drawnState=0;
			// 		}else{
			// 			//otherwise set cell state to zero
			// 			drawnState=GRID.finiteArray[x-GRID.finiteArea.left+GRID.finiteArea.margin][y-GRID.finiteArea.top+GRID.finiteArea.margin]+1;
			// 		}
			// 	}
			// }else{
			// 	//if the cursor begins to draw set the state
			// 	if(drawnState=== -1){
			// 		isPlaying=0;
			// 		if(GRID.finiteArray[x-GRID.finiteArea.left+GRID.finiteArea.margin][y-GRID.finiteArea.top+GRID.finiteArea.margin]===state){
			// 			//set cell state to live(highest state)
			// 			drawnState=0;
			// 		}else{
			// 			//otherwise set cell state to zero
			// 			drawnState=state;
			// 		}
			// 	}
			// 	isPlaying=0;
			// }
			gridPopulation+=state===1?1:-1;
			GRID.finiteArray[x-GRID.finiteArea.left+GRID.finiteArea.margin][y-GRID.finiteArea.top+GRID.finiteArea.margin]=state;
		}
	}
}

function writePatternToGrid(xPos, yPos, pattern, node){
	const xSign=[-1,1,-1,1];
	const ySign=[-1,-1,1,1];
	if(node.distance===1){
		if(xPos<=0&&xPos+0.5>-pattern.length&&yPos<=0&&yPos+0.5>-pattern[0].length){
			let temporaryNode = new TreeNode(node.distance);
			temporaryNode.value=pattern[-xPos-0.5][-yPos-0.5];
			if(temporaryNode.value<0||(temporaryNode.value!==0&&!temporaryNode.value))console.error("invalid state written:" , temporaryNode.value);
			
			return writeNode(temporaryNode);
		}else{
			return node;
		}
	}else{
		let temporaryNode=new TreeNode(node.distance);
		for(let i=0; i<4; i++){
			if((yPos>0&&i<2)||(xPos<-pattern.length&&i%2===1)||(xPos>0&&i%2===0)||(yPos<-pattern[0].length&&i>3)){
				temporaryNode.child[i]=node.child[i];
			}else{
				temporaryNode.child[i]=writePatternToGrid(xPos-0.25*(node.distance*xSign[i]), yPos-0.25*(node.distance*ySign[i]), pattern, node.child[i]);
			}
		}
		temporaryNode.value=getValue(temporaryNode);
		return writeNode(temporaryNode);
	}
}

function getResult(node){
	let result = new TreeNode(node.distance>>>1);

	if(node.distance<4){
		console.log("Error: Cannot find result of node smaller than 4");
	}else if(node.distance===4){
		//the result of nodes 4 cells wide are calculated conventionally
		result=writePatternToGrid(-1,-1,iteratePattern(readPatternFromTree(new Area(-2,2,2,-2), {head:node}),1,3,3,1),getEmptyNode(2));
	}else if(node.distance>=8){
		//the result of larger nodes are calculated based on the results of their child nodes
		//
		//   _______________
		//  |               |
		//  |    _______    |
		//  |   |       |   |
		//  |   | find  |   |
		//  |   |  this |   |
		//  |   |_______|   |
		//  |               |
		//  |_______________|
		//
		//by first making four empty 1/4 width nodes
		//   _______________
		//  |               |
		//  |    _______    |
		//  |   |1  |2  |   |
		//  |   |___|___|   |
		//  |   |3  |4  |   |
		//  |   |___|___|   |
		//  |               |
		//  |_______________|
		//
		//then setting the corner 1/8 width corner nodes
		//   _______________
		//  |               |
		//  |    _______    |
		//  |   |1|   |2|   |
		//  |   |       |   |
		//  |   |       |   |
		//  |   |3|___|4|   |
		//  |               |
		//  |_______________|
		//
		//using on the results from the nodes four 1/2 width children
		//   _______________
		//  |  ___  |  ___  |
		//  | |  _| | |_  | |
		//  | |_|1| | |2|_| |
		//  |_______|_______|
		//  |  ___  |  ___  |
		//  | | |3| | |4| | |
		//  | |___| | |___| |
		//  |_______|_______|
		//
		for(let i = 0;i < 4;i++){
			result.child[i]=new TreeNode(node.distance>>>2);
			result.child[i].child[i]=node.child[i].result.child[3-i];
		}

		//to find the rest of the 1/8 width potions of the result, temporary 1/2 width nodes are made on each edge and the center
		//   _______________        _______________        _______________        _______________        _______________
		//  |   |   |   |   |      |               |      |               |      |               |      |               |
		//  |   |___|___|   |      |        _______|      |               |      |_______        |      |    _______    |
		//  |   |   |   |   |      |       |   |   |      |               |      |   |   |       |      |   |   |   |   |
		//  |   |___|___|   |      |       |___|___|      |    _______    |      |___|___|       |      |   |___|___|   |
		//  |               |      |       |   |   |      |   |   |   |   |      |   |   |       |      |   |   |   |   |
		//  |               |      |       |___|___|      |   |___|___|   |      |___|___|       |      |   |___|___|   |
		//  |               |      |               |      |   |   |   |   |      |               |      |               |
		//  |_______________|      |_______________|      |___|___|___|___|      |_______________|      |_______________|
		//
		//next the result is calculated for each temporary node
		//   _______________        _______________        _______________        _______________        _______________
		//  |   |   |   |   |      |               |      |               |      |               |      |               |
		//  |   |___|___|   |      |        _______|      |               |      |_______        |      |    _______    |
		//  |   | |1|2| |   |      |       |  _|   |      |               |      |   |_  |       |      |   |  _|_  |   |
		//  |   |___|___|   |      |       |_|2|___|      |    _______    |      |___|1|_|       |      |   |_|1|2|_|   |
		//  |               |      |       | |4|   |      |   |  _|_  |   |      |   |3| |       |      |   | |3|4| |   |
		//  |               |      |       |___|___|      |   |_|3|4|_|   |      |___|___|       |      |   |___|___|   |
		//  |               |      |               |      |   |   |   |   |      |               |      |               |
		//  |_______________|      |_______________|      |___|___|___|___|      |_______________|      |_______________|
		//
		//those results are used to assemble the result of the main node
		//   _______________
		//  |               |
		//  |    _______    |
		//  |   |1|1|2|2|   |
		//  |   |1|1|2|2|   |
		//  |   |3|3|4|4|   |
		//  |   |3|3|4|4|   |
		//  |               |
		//  |_______________|
		//
		//top
		let temporaryNode=new TreeNode(node.distance>>>1);
		temporaryNode.child[0]=node.child[0].child[1];
		temporaryNode.child[1]=node.child[1].child[0];
		temporaryNode.child[2]=node.child[0].child[3];
		temporaryNode.child[3]=node.child[1].child[2];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		result.child[0].child[1]=temporaryNode.result.child[2];
		result.child[1].child[0]=temporaryNode.result.child[3];


		//right
		temporaryNode=new TreeNode(node.distance>>>1);
		temporaryNode.child[0]=node.child[1].child[2];
		temporaryNode.child[1]=node.child[1].child[3];
		temporaryNode.child[2]=node.child[3].child[0];
		temporaryNode.child[3]=node.child[3].child[1];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		result.child[1].child[3]=temporaryNode.result.child[0];
		result.child[3].child[1]=temporaryNode.result.child[2];


		//bottom
		temporaryNode=new TreeNode(node.distance>>>1);
		temporaryNode.child[0]=node.child[2].child[1];
		temporaryNode.child[1]=node.child[3].child[0];
		temporaryNode.child[2]=node.child[2].child[3];
		temporaryNode.child[3]=node.child[3].child[2];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		result.child[3].child[2]=temporaryNode.result.child[1];
		result.child[2].child[3]=temporaryNode.result.child[0];


		//left
		temporaryNode=new TreeNode(node.distance>>>1);
		temporaryNode.child[0]=node.child[0].child[2];
		temporaryNode.child[1]=node.child[0].child[3];
		temporaryNode.child[2]=node.child[2].child[0];
		temporaryNode.child[3]=node.child[2].child[1];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);

		result.child[2].child[0]=temporaryNode.result.child[3];
		result.child[0].child[2]=temporaryNode.result.child[1];


		//center
		temporaryNode=new TreeNode(node.distance>>>1);
		temporaryNode.child[0]=node.child[0].child[3];
		temporaryNode.child[1]=node.child[1].child[2];
		temporaryNode.child[2]=node.child[2].child[1];
		temporaryNode.child[3]=node.child[3].child[0];
		temporaryNode.value=getValue(temporaryNode);

		temporaryNode=writeNode(temporaryNode);
		result.child[0].child[3]=temporaryNode.result.child[0];
		result.child[1].child[2]=temporaryNode.result.child[1];
		result.child[2].child[1]=temporaryNode.result.child[2];
		result.child[3].child[0]=temporaryNode.result.child[3];

		//store each child of the result node in the hashtable
		for(let i = 0;i < 4;i++){
			result.child[i].value=getValue(result.child[i]);
			result.child[i]=writeNode(result.child[i]);
		}
		result.value=getValue(result);
	}
	//store the result node in the hashtable
	return writeNode(result);
}

function writeNode(node){
	calculateKey(node);
	let hashedList=hashTable[node.key%hashTable.length], previousNode=null;
	let maxDepthReached=0;
	//search through the linked list stored at the hash value
	for(let h=0;;h++){
		if(h>maxDepth){
			console.log(`maxDepth of ${maxDepth} reached.`);
			break;
		}
		if(!hashedList){
			//uses a weighted average of the max depth read within the hashtable 
			node.depth=h;
			if(node.result===null&node.distance>=4){
				node.result = getResult(node);
			}

			if(previousNode)previousNode.nextHashedNode=node;
			if(!hashTable[node.key%hashTable.length]){
				hashTable[node.key%hashTable.length]=node;
			}

			numberOfNodes++;
			break;
		}else if(isEqual(hashedList,node)){
			node=hashedList;
			if(previousNode)previousNode.nextHashedNode=node;
			if(!hashTable[node.key%hashTable.length]){
				hashTable[node.key%hashTable.length]=node;
			}
			break;
		}

		maxDepthReached++;
		previousNode=hashedList;
		hashedList=hashedList.nextHashedNode;
	}

	depthTotal+=maxDepthReached;
	depthCount++;
	if(!hashTableDepths[maxDepthReached])hashTableDepths[maxDepthReached]=0;
	hashTableDepths[maxDepthReached]++;
	return node;
}

function isEqual(tree1, tree2){
	if(tree1===tree2){
		return true;
	}else if(tree1&&tree2){
		if(tree1.distance===1&&tree2.distance===1){
			if(tree1.value===tree2.value){
				return true;
			}
		}else if(tree1.distance===tree2.distance){
			for(let h = 0;h<4;h++){
				if(isEqual(tree1.child[h],tree2.child[h])===false)return false;
			}
			return true;
		}
	}
	return false;
}

function getValue(node){
	if(node.distance===1){
		return node.value;
	}else if(node.child[0].value!==null&&
	         node.child[0].value===node.child[1].value&&
	         node.child[1].value===node.child[2].value&&
	         node.child[2].value===node.child[3].value){
		return node.child[0].value;
	}else{
		return null;
	}
}

function doubleSize(node){
	emptyNodes=emptyNodes.map(()=>null);
	let temporaryNode=new TreeNode(node.distance<<1);
	for(let i = 0;i < 4;i++){
		temporaryNode.child[i]=new TreeNode(node.distance);
		temporaryNode.child[i].child[3-i]=node.child[i];

		emptyNodes[GRID.backgroundState]=getEmptyNode(node.distance>>>1);
		for(let j = 0;j < 4;j++){
			if(j!==3-i){
				temporaryNode.child[i].child[j]=emptyNodes[GRID.backgroundState];
			}
		}
		temporaryNode.child[i].value=getValue(temporaryNode.child[i]);
		temporaryNode.child[i]=writeNode(temporaryNode.child[i]);
	}
	temporaryNode.value=getValue(temporaryNode);
	return writeNode(temporaryNode);
}

//TODO: move to worker

function widenTree(area,tree=GRID.head){
	let newTree=tree;
	for(let h=0;;h++){
		if(h>maxDepth){
			console.log(`maxDepth of ${maxDepth} reached.`);
			break;
		}
		if(-newTree.distance>4*area.top||newTree.distance<=4*area.right||
			newTree.distance<=4*area.bottom||-newTree.distance>4*area.left){
			newTree=doubleSize(newTree);
		}else{
			break;
		}
	}
	return newTree;
}

//go to before the simulation started
function reset(pause=true){
	//remove mark branch of salvo inactive if the result has occurred before
	//TODO: rewrite
	// const searchElements=document.getElementById("searchOptions").children;
	// for(let i=0;i<searchElements.length;i++){
	// 	const resetCondition=Array.from(searchElements[i].getElementsByClassName("condition")).findIndex(x => x.children[0].innerHTML==="Reset");
	// 	if(resetCondition!==-1&&searchElements[i].info){
	// 		searchElements[i].info.progress.slice(-1)[0].result=GRID.head;
	// 		for(let j=0;j <searchElements[i].info.progress.length-2;j++){
	// 			if(GRID.head===searchElements[i].info.progress[j].result){
	// 				searchElements[i].info.progress.slice(-1)[0].repeatedResult=true;
	// 				break;
	// 			}
	// 		}
	// 		break;
	// 	}
	// }

	if(resetEvent!==null){
		runningSimulation = false;
		setEvent(resetEvent);
		resetEvent=null;
		GRID.backgroundState=0;
	}
	wasReset=true;
	sendVisibleCells();
}

function writePatternAndSave(xPosition,yPosition,pattern){
	if(!pattern||pattern.length===0)return currentEvent;
	const previousPattern=readPattern(new Area(yPosition,xPosition+pattern.length,yPosition+pattern[0].length,xPosition),GRID);
	
	//if a grid other than the "main" grid is passed as a 4th argument
	if(GRID.type===0){
		//write to the provided infinte grid
		GRID.head=widenTree({top:yPosition,right:xPosition+pattern.length,bottom:yPosition+pattern[0].length,left:xPosition},GRID.head);
		GRID.head=writePatternToGrid(xPosition,yPosition, pattern, GRID.head);
	}else{
		//write to the provided finite grid
		let somethingChanged=false;
		/*for (let i = 0; i < pattern.length; i++) {
			for (let j = 0; j < pattern[0].length; j++) {
				if(j+yPosition>=finiteGridTop-finiteGridMargin&&i+xPosition<finiteGridLeft+finiteGrid.length-2+finiteGridMargin&&j+yPosition<finiteGridTop+finiteGrid[0].length-2+GRID.finiteArea.margin&&i+xPosition>=finiteGridLeft-finiteGridMargin){
					finiteGrid[i-finiteGridLeft+finiteGridMargin+xPosition][j-finiteGridTop+finiteGridMargin+yPosition]=pattern[i][j];
					somethingChanged=true;
				}
			}
		}*/
    console.log(pattern);
		for (let i = 0; i < pattern.length; i++) {
			for (let j = 0; j < pattern[0].length; j++) {
				if(j+yPosition>=GRID.finiteArea.top&&i+xPosition<GRID.finiteArea.right-2*GRID.finiteArea.margin&&j+yPosition<GRID.finiteArea.bottom-2*GRID.finiteArea.margin&&i+xPosition>=GRID.finiteArea.left){
          console.log(i,j);
					GRID.finiteArray[i+xPosition-GRID.finiteArea.left+GRID.finiteArea.margin][j+yPosition-GRID.finiteArea.top+GRID.finiteArea.margin]=pattern[i][j];
					somethingChanged=true;
				}
			}
		}
		if(somethingChanged===false)return currentEvent;
	}
	return new EventNode(currentEvent, Date.now(), "paste", {newPatt:[xPosition,yPosition,pattern], oldPatt:[xPosition,yPosition,previousPattern]});
}

function writePattern(xPosition,yPosition,pattern,objectWithGrid){
	//if the grid is infinite
	if(objectWithGrid.type!==0){
		console.log(GRID.finiteArray);
		console.log(pattern, GRID.finiteArea);
		//write to the finite grid
		for (let i = 0; i < pattern.length; i++) {
			for (let j = 0; j < pattern[0].length; j++) {
				if(j+yPosition>=objectWithGrid.finiteArea.top-objectWithGrid.finiteArea.margin&&i+xPosition<objectWithGrid.finiteArea.left+objectWithGrid.finiteArray.length-objectWithGrid.finiteArea.margin&&j+yPosition<objectWithGrid.finiteArea.top+objectWithGrid.finiteArray[0].length-objectWithGrid.finiteArea.margin&&i+xPosition>=objectWithGrid.finiteArea.left-objectWithGrid.finiteArea.margin){
					objectWithGrid.finiteArray[i-objectWithGrid.finiteArea.left+objectWithGrid.finiteArea.margin+xPosition][j-objectWithGrid.finiteArea.top+objectWithGrid.finiteArea.margin+yPosition]=pattern[i][j];
				}
			}
		}
		console.log(xPosition, yPosition, GRID.finiteArray);
	}else{
		//write to the infinte grid
		objectWithGrid.head=widenTree({top:yPosition,right:xPosition+pattern.length,bottom:yPosition+pattern[0].length,left:xPosition},objectWithGrid.head);
		objectWithGrid.head=writePatternToGrid(xPosition,yPosition, pattern, objectWithGrid.head);
	}
}

function setEvent(gridEvent){
	if(!("type" in gridEvent)){
		setEvent(gridEvent.parent);
    try {
      if("draw" in gridEvent){
        for(let i=0;i<gridEvent.draw.length;i++){
          writePattern(gridEvent.draw[i].x,gridEvent.draw[i].y,[[gridEvent.draw[i].newState]], GRID);
        }
        //TODO: rewrite
        // if(socket&&resetEvent===null)socket.emit("draw",Date.now(),gridEvent.draw);
      }else if("paste" in gridEvent){
        writePattern(...gridEvent.paste.newPatt, GRID);
        //TODO: rewrite
        // if(socket&&resetEvent===null)socket.emit("paste",Date.now(),gridEvent.paste);
      }
    } catch (error) {
      console.log("Warning: Invalid Event Data within: ", gridEvent);
      throw error;
    }
	}else{
		if("generation" in gridEvent){
			genCount=gridEvent.generation;
			//TODO: check if necessary
			// document.getElementById("gens").innerHTML="Generation "+genCount;
		}
		if("backgroundState" in gridEvent)GRID.backgroundState=gridEvent.backgroundState;

		if("resetEvent" in gridEvent)resetEvent=gridEvent.resetEvent;

		//redundant, remove at some point if "type" is still used for events storing the entire grid
		if("type" in gridEvent){
			GRID.type=gridEvent.type;
			// setMenu("gridMenu",GRID.type);
			
			emptyNodes=emptyNodes.map(()=>null);
			if(GRID.type===0){
				GRID.head=gridEvent.head;
				//TODO: check if necessary
				// document.getElementById("population").innerHTML="Population "+GRID.head.population;
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
      //TODO: rewrite
    	// if(socket&&resetEvent===null)socket.emit("undoDraw",Date.now(),currentEvent.draw);
    	currentEvent=currentEvent.parent;
    }else if("paste" in currentEvent){
    	writePattern(...currentEvent.paste.oldPatt, GRID);

      //TODO: rewrite
    	// if(socket&&resetEvent===null)socket.emit("undoPaste",Date.now(),currentEvent.paste);
    	currentEvent=currentEvent.parent;
    }else{
			setEvent(currentEvent.parent);
		}
		//compare parents because the reset event may be a different event with identical values
		if(resetEvent!==null&&resetEvent.parent===currentEvent.parent)resetEvent=null;
	}
	isPlaying=0;
	sendVisibleCells();
}

function redo(){
	if(currentEvent.child!==null){
		if("draw" in currentEvent.child){
			currentEvent=currentEvent.child;
			for(let i=0;i<currentEvent.draw.length;i++){
				writePattern(currentEvent.draw[i].x,currentEvent.draw[i].y,[[currentEvent.draw[i].newState]], GRID);
			}
      //TODO: rewrite
			// if(socket&&resetEvent===null)socket.emit("draw",Date.now(),currentEvent.draw);
		}else if("paste" in currentEvent.child){
			currentEvent=currentEvent.child;
			writePattern(...currentEvent.paste.newPatt, GRID);

			//TODO: fix
			// if(socket&&resetEvent===null)socket.emit("paste",Date.now(),currentEvent.paste);
		}else{
			setEvent(currentEvent.child);
		}
	}
	isPlaying=0;
	sendVisibleCells();
}

async function identify(area){
	const startTime=Date.now();
  area = area.isActive ? area : new Area(...calculateBounds(GRID));
	let patternInfo=findShip(readPattern(area),area);
	if(patternInfo.period===0){
    //TODO: send alert back to UI thread
		// alert("couldn't recognize periodic pattern");
		return;
	}
  patternInfo.timeElapsed=Date.now()-startTime;
  postMessage({type:"identificationResults",value:patternInfo});
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
	const startLocation=findPattern(readPattern(area,grid),ship);
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
	let searchArea = new Area(0,0,0,0), spaceshipEnvelope=[...initialShipPosition];

	let speedOfLight=1;//0.5;
	//if(ruleHasLightSpeedShips)speedOfLight=1;

	for(let period=1;period<maxPeriod;period++){
		gen(grid);
		searchArea.top=initialShipPosition[0]-Math.floor(period*speedOfLight);
		searchArea.right=initialShipPosition[1]+Math.ceil( period*speedOfLight);
		searchArea.bottom=initialShipPosition[2]+Math.ceil( period*speedOfLight);
		searchArea.left=initialShipPosition[3]-Math.floor(period*speedOfLight);

		const search=readPatternFromTree(searchArea,grid);
		let location=findPattern(readPatternFromTree(searchArea,grid),ship);
		spaceshipEnvelope[0]=Math.min(searchArea.top+getTopPatternMargin(search)   ,spaceshipEnvelope[0]);
		spaceshipEnvelope[1]=Math.max(searchArea.left+getRightPatternMargin(search) ,spaceshipEnvelope[1]);
		spaceshipEnvelope[2]=Math.max(searchArea.top+getBottomPatternMargin(search),spaceshipEnvelope[2]);
		spaceshipEnvelope[3]=Math.min(searchArea.left+getLeftPatternMargin(search)  ,spaceshipEnvelope[3]);

		if(location.x!==-1){
			setEvent(initialEvent);
			let shipPattern=new Array(period);
			//find pattern
			for(let j=0;j<period;j++){
				shipPattern[j]=readPatternFromTree(new Area(...spaceshipEnvelope), grid);
				gen(grid);
			}
      //TODO: rewrite
			setEvent(initialEvent);
			return {
				dx:(location.x+searchArea.left)-(startLocation.x+area.left),
				dy:(location.y+searchArea.top)-(startLocation.y+area.top),
				shipOffset:{x:spaceshipEnvelope.left-area.left,y:spaceshipEnvelope.top-area.top},
				period:period,
				phases:shipPattern
			};
		}
	}
  //TODO: rewrite
	setEvent(initialEvent);
	return {dx:null, dy:null, shipOffset:{x:null,y:null},period:0,phases:[]};
}

function findShip(ship,areaBounds){
	if(-1===findPattern(readPattern(areaBounds),ship).x){
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
		return getSpaceshipEnvelope(ship,GRID,areaBounds);
	}
}

//TODO: have function return pattern to be added to paste area
function importRLE(rleText){
	if(rleText.length===0){
		console.log("RLE box empty");
		return -1;
	}

	const parsedRLE = parseRLE(rleText);

	if(rleText&&parsedRLE.pattern){
		if(ruleMetadata.string!==parsedRLE.rule)setRule(parsedRLE.rule);

		if(rule.length===2){
			for (let i = 0; i < parsedRLE.pattern.length; i++) {
				for (let j = 0; j < parsedRLE.pattern[i].length; j++) {
					parsedRLE.pattern[i][j]=parsedRLE.pattern[i][j]%2===1?1:0;
				}
			}
		}

		if(parsedRLE.type===-1)return -1;
		let left=-Math.ceil((parsedRLE.xWrap|parsedRLE.width|parsedRLE.pattern.length)/2),
				top=-Math.ceil((parsedRLE.yWrap|parsedRLE.height|parsedRLE.pattern[0].length)/2);
    console.log(top, left);

		if(GRID.head.value===0&GRID.type===0){
			let previousPattern=new Array(parsedRLE.pattern.length);
			for(let i=0;i<previousPattern.length;i++){
				previousPattern[i]=new Array(parsedRLE.pattern[0].length).fill(0);
			}

			//TODO: rewrite
			// if(socket)socket.emit("paste", Date.now(), {newPatt:[-Math.ceil(parsedRLE.pattern.length/2),-Math.ceil(parsedRLE.pattern[0].length/2),parsedRLE.pattern], oldPatt:[-Math.ceil(parsedRLE.pattern.length/2),-Math.ceil(parsedRLE.pattern[0].length/2),previousPattern]});
			console.log(parsedRLE.pattern, top, left);
			if(/[PT]/.test(parsedRLE.type)){
				importPattern(parsedRLE.pattern,parsedRLE.type,top,left,parsedRLE.xWrap,parsedRLE.yWrap);
				// fitView();
			}else{
				importPattern(parsedRLE.pattern,parsedRLE.type,top,left);
				// fitView(top, left+parsedRLE.width, top+parsedRLE.height, left);
			}

			currentEvent=new EventNode(currentEvent, "import RLE");
			console.log(rule);
			//TODO: send state of grid to other clients

			console.log(GRID.head);
			return parsedRLE;
		}else{
			activeClipboard=0;
			clipboard[activeClipboard].pattern=parsedRLE.pattern;
			editMode=1;
			pasteArea.isActive=true;
			pasteArea.left=-Math.ceil(parsedRLE.pattern.length/2);
			pasteArea.top=-Math.ceil(parsedRLE.pattern[0].length/2);
			//TODO: rewrite
			// setActionMenu();
			return parsedRLE.pattern;
		}
	}
	//TODO: replace render here
}

function parseRLE(input){
	const regex = /x = (?<width>\d+), y = (?<height>\d+)(?:, rule = (?<rule>[\w\/\-]+)(?::(?<type>[TP])(?<xWrap>\d+\*?(?:\+\d+)?),(?<yWrap>\d+\*?(?:\+\d+)?))?)?\r?\n(?<pattern>(?:.|\r?\n)*!)/;
	const rle = input.match(regex);
	if(!rle){
		console.log("Error, RLE not found in text: ", input);
		return {width:0,height:0,rule:"",type:"",xWrap:0,yWrap:0,pattern:[[]]};
	}

	let parsedRLE = rle.groups;
	parsedRLE.pattern=rleToPattern(parsedRLE.pattern,parseInt(parsedRLE.width),parseInt(parsedRLE.height));
	parsedRLE.width=parseInt(parsedRLE.width)||parsedRLE.pattern.length;
	parsedRLE.height=parseInt(parsedRLE.height)||parsedRLE.pattern[0].length;
	parsedRLE.xWrap=parseInt(parsedRLE.xWrap);
	parsedRLE.yWrap=parseInt(parsedRLE.yWrap);

	return parsedRLE;
}

function rleToPattern(input,width,height){
	//check for any invalid chars in rle
	let unsupportedChars = input.match(/(?![0-9A-Z\.bo\$!])./g);
	if(unsupportedChars!==null){
    postMessage({type: "alert", value:"Unsupported Character In Rule: "+unsupportedChars});
		return array;
	}

	//Array which will contain the pattern
	let array = new2dArray(width, height);
	//Coordinates of the cell currently being read from the rle
	let xCoord=0, yCoord=0;
	//Split the input into parts eg. ["2b", "o", "2$", ...]
	input=input.split(/(?<=[A-Z\.bo\$])/g);
	for (let i = 0; i < input.length; i++) {
		//Isolate the run length from the char, defaulting to 1
		let character = input[i].slice(-1),number=parseInt(input[i].match(/[0-9]+/)||1);
		if(/!/.test(input[i]))break;

		//Write to the array based on the character and current cell being written
		for (let j = 0; j < number; j++) {
			//expand the pattern if RLE extends past the dimensions in the header
			if(character!=="$"&&array.length==xCoord)array.push(Array(yCoord+1).fill(0));
			if(character!=="$"&&array[xCoord].length==yCoord)array.forEach(e => e.push(0));

			//write cell state or move to newline based on the character
			switch(character){
				case "o":
					array[xCoord][yCoord]=1; break;
				case "b": case ".":
					array[xCoord][yCoord]=0; break;
				case "$":
					yCoord++;
					xCoord=0;
					break;
				default:
					if(/[A-Z]/.test(character))array[xCoord][yCoord]=character.charCodeAt(0)-64; break;
			}
			if(/[A-Z\.bo]/.test(character)) xCoord++;
		}
	}

	return array;
}

function patternToRLE(pattern, ruleFormat){
	console.log(exportRulestring(ruleFormat));
	if(pattern.length===0)return `x = 0, y = 0, rule = ${exportRulestring(ruleFormat)}\n!`;
	let RLE=`x = ${pattern.length}, y = ${pattern[0].length}, rule = ${exportRulestring(ruleFormat)}`, numberOfAdjacentLetters=0;
	if(GRID.type===1)RLE+=`:P${pattern.length},${pattern[0].length}`;
	if(GRID.type===2)RLE+=`:T${pattern.length},${pattern[0].length}`;
	RLE+="\n";
	for(let j=0;j<pattern[0].length;j++){
		let endOfLine=0;
		for(let i=pattern.length-1;i>=0;i--){
			if(pattern[i][j]!==0){
				if(numberOfAdjacentLetters>1)RLE+=numberOfAdjacentLetters;
				endOfLine=i+1;
				break;
			}
		}
		if(endOfLine===0){
			numberOfAdjacentLetters++;
		}else{
			if(numberOfAdjacentLetters!==0){
				RLE+="$";
				numberOfAdjacentLetters=0;
			}
			for(let i=0;i<endOfLine;i++){
				numberOfAdjacentLetters++;
				if(i===endOfLine-1||pattern[i][j]!==pattern[i+1][j]){
					if(numberOfAdjacentLetters>1){
						RLE+=numberOfAdjacentLetters;
					}
					if(rule.length===2&&!/.+(Super)|(History)$/g.test(ruleMetadata.string)){
						if(pattern[i][j]===0){
							RLE+="b";
						}else{
							RLE+="o";
						}
					}else{
						if(pattern[i][j]===0){
							RLE+=".";
						}else{
							RLE+=String.fromCharCode(64+pattern[i][j]);
						}
					}
					numberOfAdjacentLetters=0;
				}
			}
			numberOfAdjacentLetters=1;
		}
	}

	//adds a line break at least every 70 chars
	//avoids splitting numbers
	RLE=RLE.split("");
	let lineLength=0;
	for(let i=0;i<RLE.length;i++){
		//skip the header line
		if(i===0)while(RLE[i]!=="\n"&&i<RLE.length)i++;
		lineLength++;
		if(RLE[i]==="\n")lineLength=0;
		if(lineLength>70){
			for(let j=0;j<70;j++){
				if(isNaN(RLE[i-j-1])){
					RLE.splice(i-j,0,"\n");
					lineLength=j;
					break;
				}
			}
		}
	}
	return RLE.join("")+"!";
}

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

function exportPattern(){
	switch(GRID.type){
	case 0:
		return {xOffset:(getLeftBorder(GRID.head)??0)/2-0.5,
			yOffset:(getTopBorder(GRID.head)??0)/2-0.5,
			pattern:readPattern(new Area((getTopBorder(GRID.head)??0)/2-0.5,(getRightBorder(GRID.head)??0)/2+0.5,(getBottomBorder(GRID.head)??0)/2+0.5,(getLeftBorder(GRID.head)??0)/2-0.5))};
	case 1:{
		let pattern=new Array(GRID.finiteArray.length-2);
		for(let i=0; i<pattern.length;i++){
			pattern[i]=new Array(GRID.finiteArray[0].length-2);
			for(let j=0; j<pattern[0].length;j++){
				if(i<GRID.finiteArray.length-1&&j<GRID.finiteArray[0].length-1){
					pattern[i][j]=GRID.finiteArray[i+1][j+1];
				}else{
					pattern[i][j]=GRID.backgroundState;
				}
			}
		}
		return {xOffset:GRID.finiteArea.left,
			yOffset:GRID.finiteArea.top,
			pattern:pattern};

	}
	case 2:
		return {xOffset:GRID.finiteArea.left,
			yOffset:GRID.finiteArea.top,
			pattern:GRID.finiteArray};
	default:
		throw new Error("exporting unknown grid type");
	}
}

//places a pattern and moves the grid down and to the right by some offset
function importPattern(pattern,type,top,left,width=pattern.length,height=pattern[0].length){
	console.log(top+" "+left);
	console.log(pattern);
	switch(type){
		case "P": case 1:
			GRID.type = 1;
			GRID.finiteArea.margin=1;
			console.log("set P");
			break;
		case "T": case 2:
			GRID.type = 2;
			GRID.finiteArea.margin=0;
			console.log("set T");
			break;
		default:
			if(/[KCS]/.test(type)){
				throw new Error("unsupported finite grid type");
				return;
			}else{
				GRID.type = 0;
				GRID.head=getEmptyNode(8);
				GRID.head=widenTree({top:top, right:left+width, bottom:top+height, left:left});
				console.log(top+" "+left);
				GRID.head=writePatternToGrid(left, top, pattern, GRID.head);
			}
	}
		console.log("done?");
	if(GRID.type===1||GRID.type===2){
		GRID.finiteArea.top =top;
		GRID.finiteArea.right =left + width + GRID.finiteArea.margin*2;
		GRID.finiteArea.bottom =top + height + GRID.finiteArea.margin*2;
		GRID.finiteArea.left =left;
    console.log(width, height, GRID.finiteArea);

		GRID.finiteArray = new2dArray(width+GRID.finiteArea.margin*2, height+GRID.finiteArea.margin*2);
		console.log("write Pattern");
		writePattern(left, top, pattern, GRID);
	}
	console.log("done");
	GRID.finiteArea.newTop=GRID.finiteArea.top;
	GRID.finiteArea.newRight=GRID.finiteArea.right;
	GRID.finiteArea.newBottom=GRID.finiteArea.bottom;
	GRID.finiteArea.newLeft=GRID.finiteArea.left;
}

function setGridType(gridNumber){
	let results=exportPattern();
	GRID.type=gridNumber;
	console.log("importGridPattern", GRID.type);

	importPattern(results.pattern,gridNumber,results.yOffset,results.xOffset);
	currentEvent=new EventNode(currentEvent,"changeGrid");
	return [results.pattern,gridNumber,results.xOffset,results.yOffset];
}

function getTopBorder(node){
	const ySign=[-1,-1,1,1];
	if(node.distance===1)return node.value!==0?0:null;
	
	let currentMin=null, cache;
	for(let i=0;i<4;i++){
		cache=getTopBorder(node.child[i]);
		if(cache!==null&&(currentMin===null||currentMin>(node.distance>>1)*ySign[i]+cache)){
			currentMin=(node.distance>>1)*ySign[i]+cache;
		}
	}
	return currentMin;
}

function getRightBorder(node){
	const xSign=[-1,1,-1,1];
	if(node.distance===1)return node.value!==0?0:null;
	
	let currentMax=null, cache;
	for(let i=0;i<4;i++){
		cache=getRightBorder(node.child[i]);
		if(cache!==null&&(currentMax===null||currentMax<(node.distance>>1)*xSign[i]+cache)){
			currentMax=(node.distance>>1)*xSign[i]+cache;
		}
	}
	return currentMax;
}

function getBottomBorder(node){
	const ySign=[-1,-1,1,1];
	if(node.distance===1)return node.value!==0?0:null;
	
	let currentMax=null, cache;
	for(let i=0;i<4;i++){
		cache=getBottomBorder(node.child[i]);
		if(cache!==null&&(currentMax===null||currentMax<(node.distance>>1)*ySign[i]+cache)){
			currentMax=(node.distance>>1)*ySign[i]+cache;
		}
	}
	return currentMax;
}

function getLeftBorder(node){
	const xSign=[-1,1,-1,1];
	if(node.distance===1)return node.value!==0?0:null;
	
	let currentMin=null, cache;
	for(let i=0;i<4;i++){
		cache=getLeftBorder(node.child[i]);
		if(cache!==null&&(currentMin===null||currentMin>(node.distance>>1)*xSign[i]+cache)){
			currentMin=(node.distance>>1)*xSign[i]+cache;
		}
	}
	return currentMin;
}

function getBounds(){
  postMessage({id:e.data.id, response:calculateBounds(GRID)});
}

function calculateBounds(gridObj){
  if(gridObj.type===0){
    return [
      getTopBorder(gridObj.head)/2-0.5,
      getRightBorder(gridObj.head)/2+0.5,
      getBottomBorder(gridObj.head)/2+0.5,
      getLeftBorder(gridObj.head)/2-0.5];
  }else{
    return [
      gridObj.finiteArea.top,
      gridObj.finiteArea.right,
      gridObj.finiteArea.bottom,
      gridObj.finiteArea.left];
  }
}

function resetHashtable(){
	reset();
	currentEvent.child=null;
	hashTable=new Array(hashTable.length);
	GRID.head.result=recalculateResult(GRID.head);
}

function recalculateResult(node){
	if(node.distance>4){
		for(let i=0;i<4;i++){
			node.child[i].result=recalculateResult(node.child[i]);
		}
	}
	return getResult(node);
}

//handle the various kinds of rule strings
function setRule(ruleText){
	const alias={
		Life:"B3/S23",
		LifeHistory:"B3/S23History",
		HighLife:"B36/S23",
		HighLifeHistory:"B36/S23History"};
	if(alias[ruleText]){
    ruleMetadata.string=ruleText;
		parseRulestring(alias[ruleMetadata.string]);
	}else{
    ruleMetadata.string=clean(ruleText);
		parseRulestring(ruleMetadata.string);
	}
	resetHashtable();
}

function generateTree(stateArray,depth,stateCount,ruleText){
	let node=new Array(stateCount);

	for(let i=0;i<stateCount;i++){
		ruleMetadata.size++;
		if(depth===8){
			node[i]=getTransition([...stateArray,i],stateCount,ruleText);
		//speeds up parsing generations rules, circumvents treating odd states as live
		}else if(ruleMetadata.family==="Generations"&&i>2){
			node[i]=node[0];
		}else if(ruleMetadata.family==="History"&&i>1&&ruleMetadata.forceDeath[i]===false&&i!==3){
			node[i]=node[i-2];
		}else{
			node[i]=generateTree([...stateArray,i],depth+1,stateCount,ruleText);
		}
	}
	return node;
}

function getTransition(stateArray,stateCount,ruleText){
	//the weights for decoding rule strings.
	//  2 16  1
	// 32     64
	//  4 128 8
	const intTransitions=[
		[0,"-"],[1,"c"],[1,"c"],[2,"c"],[1,"c"],[2,"n"],[2,"c"],[3,"c"],[1,"c"],[2,"c"],//  0
		[2,"n"],[3,"c"],[2,"c"],[3,"c"],[3,"c"],[4,"c"],[1,"e"],[2,"a"],[2,"a"],[3,"i"],// 10
		[2,"k"],[3,"q"],[3,"n"],[4,"n"],[2,"k"],[3,"n"],[3,"q"],[4,"n"],[3,"y"],[4,"y"],// 20
		[4,"y"],[5,"e"],[1,"e"],[2,"k"],[2,"a"],[3,"n"],[2,"a"],[3,"q"],[3,"i"],[4,"n"],// 30
		[2,"k"],[3,"y"],[3,"q"],[4,"y"],[3,"n"],[4,"y"],[4,"n"],[5,"e"],[2,"e"],[3,"j"],// 40
		[3,"a"],[4,"a"],[3,"j"],[4,"w"],[4,"a"],[5,"a"],[3,"k"],[4,"k"],[4,"q"],[5,"j"],// 50
		[4,"k"],[5,"k"],[5,"j"],[6,"e"],[1,"e"],[2,"a"],[2,"k"],[3,"n"],[2,"k"],[3,"q"],// 60
		[3,"y"],[4,"y"],[2,"a"],[3,"i"],[3,"q"],[4,"n"],[3,"n"],[4,"n"],[4,"y"],[5,"e"],// 70
		[2,"e"],[3,"a"],[3,"j"],[4,"a"],[3,"k"],[4,"q"],[4,"k"],[5,"j"],[3,"j"],[4,"a"],// 80
		[4,"w"],[5,"a"],[4,"k"],[5,"j"],[5,"k"],[6,"e"],[2,"i"],[3,"r"],[3,"r"],[4,"i"],// 90
		[3,"r"],[4,"z"],[4,"t"],[5,"r"],[3,"r"],[4,"t"],[4,"z"],[5,"r"],[4,"i"],[5,"r"],//100
		[5,"r"],[6,"i"],[3,"e"],[4,"r"],[4,"r"],[5,"i"],[4,"j"],[5,"q"],[5,"n"],[6,"a"],//110
		[4,"j"],[5,"n"],[5,"q"],[6,"a"],[5,"y"],[6,"k"],[6,"k"],[7,"e"],[1,"e"],[2,"k"],//120
		[2,"k"],[3,"y"],[2,"a"],[3,"q"],[3,"n"],[4,"y"],[2,"a"],[3,"n"],[3,"q"],[4,"y"],//130
		[3,"i"],[4,"n"],[4,"n"],[5,"e"],[2,"i"],[3,"r"],[3,"r"],[4,"t"],[3,"r"],[4,"z"],//140
		[4,"i"],[5,"r"],[3,"r"],[4,"i"],[4,"z"],[5,"r"],[4,"t"],[5,"r"],[5,"r"],[6,"i"],//150
		[2,"e"],[3,"k"],[3,"j"],[4,"k"],[3,"a"],[4,"q"],[4,"a"],[5,"j"],[3,"j"],[4,"k"],//160
		[4,"w"],[5,"k"],[4,"a"],[5,"j"],[5,"a"],[6,"e"],[3,"e"],[4,"j"],[4,"r"],[5,"n"],//170
		[4,"r"],[5,"q"],[5,"i"],[6,"a"],[4,"j"],[5,"y"],[5,"q"],[6,"k"],[5,"n"],[6,"k"],//180
		[6,"a"],[7,"e"],[2,"e"],[3,"j"],[3,"k"],[4,"k"],[3,"j"],[4,"w"],[4,"k"],[5,"k"],//190
		[3,"a"],[4,"a"],[4,"q"],[5,"j"],[4,"a"],[5,"a"],[5,"j"],[6,"e"],[3,"e"],[4,"r"],//200
		[4,"j"],[5,"n"],[4,"j"],[5,"q"],[5,"y"],[6,"k"],[4,"r"],[5,"i"],[5,"q"],[6,"a"],//210
		[5,"n"],[6,"a"],[6,"k"],[7,"e"],[3,"e"],[4,"j"],[4,"j"],[5,"y"],[4,"r"],[5,"q"],//220
		[5,"n"],[6,"k"],[4,"r"],[5,"n"],[5,"q"],[6,"k"],[5,"i"],[6,"a"],[6,"a"],[7,"e"],//230
		[4,"e"],[5,"c"],[5,"c"],[6,"c"],[5,"c"],[6,"n"],[6,"c"],[7,"c"],[5,"c"],[6,"c"],//240
		[6,"n"],[7,"c"],[6,"c"],[7,"c"],[7,"c"],[8,"-"]];                               //250

	const splitString=ruleText;
	let number=0,thisState=stateArray[8];
	if(ruleMetadata.family==="Generations"&&thisState>1)return (thisState+1)%stateCount;
	
	for(let i=0;i<stateArray.length-1;i++){
		if(stateArray[i]%2===1)number+=Math.pow(2,i);
		if(ruleMetadata.forceDeath[stateArray[i]]&&thisState%2===1)return ruleMetadata.deadState[thisState];
	}

	let indexOfNumber=splitString[thisState%2].indexOf(`${intTransitions[number][0]}`);
	if(indexOfNumber===-1)return ruleMetadata.deadState[thisState];

	let transitionPresent=true;
	if("aceijknqrtwyz".includes(splitString[thisState%2][indexOfNumber+1])){
		transitionPresent=false;
	}

	for(let i=indexOfNumber+1;i<splitString[thisState%2].length&&isNaN(splitString[thisState%2][i]);i++){
		if(splitString[thisState%2][i]===intTransitions[number][1]){
			transitionPresent^=true;
			break;
		}
	}

	if(transitionPresent){
		return ruleMetadata.aliveState[thisState];
	}else{
		return ruleMetadata.deadState[thisState];
	}
}

//parse Isotropic Non-Totalistic Generations rules
function parseRulestring(ruleText){
  console.log(ruleText);
	ruleMetadata.size=0;
	ruleMetadata.numberOfStates=2;
	if(ruleText.split("/").length===3)ruleMetadata.numberOfStates=parseInt(ruleText.split("/")[2].slice(1));

	if(/.+(History)$/g.test(ruleText)){
		ruleMetadata.family="History";
		ruleMetadata.color=[["#303030","#00FF00","#0000A0","#FFD8FF","#FF0000","#FFFF00","#606060"]];
		ruleMetadata.aliveState=[1,1,1,3,3,5,6];
		ruleMetadata.deadState=[0,2,2,4,4,4,6];
		ruleMetadata.forceDeath=[false,false,false,false,false,false,true];
		ruleMetadata.forceLife=[false,false,false,false,false,false,false];
		ruleMetadata.numberOfStates=7;
    console.log("History");
	}else if(/.+(Super)$/g.test(ruleText)){
		ruleMetadata.family="Super";
		ruleMetadata.color=[["#303030","#00FF00","#0000A0","#FFD8FF","#FF0000","#FFFF00","#606060"]];
		ruleMetadata.aliveState=[1,1,1,3,3,5,6];
		ruleMetadata.deadState=[0,2,2,4,4,4,6];
		ruleMetadata.forceDeath=[false,false,false,false,false,false,true];
		ruleMetadata.forceLife=[false,false,false,false,false,false,false];
		ruleMetadata.numberOfStates=20;
    console.log("Super");
	}else if(ruleMetadata.numberOfStates>2){
		ruleMetadata.family="Generations";
		ruleMetadata.color=[[]];
		ruleMetadata.aliveState=[1,1];
		ruleMetadata.deadState=[0,2];
		ruleMetadata.forceDeath=[false,false];
		ruleMetadata.forceLife=[false,false];
    console.log("Generations");
	}else{
		ruleMetadata.family="INT";
		ruleMetadata.color=[[]];
		ruleMetadata.aliveState=[1,1];
		ruleMetadata.deadState=[0,0];
		ruleMetadata.forceDeath=[false,false];
		ruleMetadata.forceLife=[false,false];
    console.log("INT");
	}

	rule=generateTree([],0,ruleMetadata.numberOfStates,ruleText.replace(/(Super)|(History)$/g,"").split("/").map(substring => substring.split("")));
	postMessage({type:"ruleMetadata",ruleMetadata:ruleMetadata});
	
	//setDrawMenu();
	postMessage({type:"setDrawMenu"});
}

function exportRulestring(format){
  const hasTwoStates = ruleMetadata.numberOfStates===2;
  const regex = /B([0-8aceijknqrtwyz-]*)\/S([0-8aceijknqrtwyz-]*)(\/G([0-9]*))?/g;
	console.log(format, ruleMetadata.string);
  switch(format){
    case "BSG": return ruleMetadata.string.replace(regex, hasTwoStates?"B$2/S$2":"B$2/S$1/G$3");
    case "gbs": return ruleMetadata.string.replace(regex, hasTwoStates?"b$1s$2":"g$3b$1s$2");
    case "sbg": return ruleMetadata.string.replace(regex, hasTwoStates?"$2/$1":"$2/$1/$3");
  }
	throw new Error("invalid format");
}

function clean(dirtyString){
	let testString = dirtyString;
	testString.replace(/History$/,"");
	if(["Life","HighLife"].includes(testString)){
		return dirtyString;
	}
	let unsupportedChars = testString.match(/(?![BSGbsg\/\-0-8aceijknqrtwyz])./)|[];
	if(unsupportedChars.length==1){
    postMessage({type: "alert", value:"Unsupported Character In Rule: "+unsupportedChars});
		return dirtyString;
	}else if(unsupportedChars.length>=2){
    postMessage({type: "alert", value:"Unsupported Characters In Rule: "+unsupportedChars});
		return dirtyString;
	}
	const table=[["-"],
	             ["-","c","e"],
	             ["-","a","c","e","i","k","n"],
	             ["-","a","c","e","i","j","k","n","q","r","y"],
	             ["-","a","c","e","i","j","k","n","q","r","t","w","y","z"],
	             ["-","a","c","e","i","j","k","n","q","r","y"],
	             ["-","a","c","e","i","k","n"],
	             ["-","c","e"],
	             ["-"]];
	//transcribe the rulestring into B#/S# or B#/S#/G# format
	const suffix=dirtyString.match(/(History)$/g);
  try{
    let ruleSections=dirtyString
      .replace(/(History)$/g,"")// B/S/GHistory -> B/S/G
      .replace(/[bsg]/g,match => match.toUpperCase())// b/s/g -> B/S/G
      .split(/\/|(?=[BSG])/);// #/#/# -> [#,#,#], B/S/G -> [B,S,G], or GBS -> [G,B,S]

    if(ruleSections.length===1){
      ruleSections[1]=ruleSections[0][0]==="B"?"S":"B";// [B] -> [B,S], or [S] -> [S,B]
    }
    //check if either rule section starts with a number
    if(/[0123456789]/g.test(ruleSections[0][0]+ruleSections[1][0])){
      //Prepend a "B", "S", or "G" to each section
      ruleSections=ruleSections.map((element,index) => "SBG"[index]+element);// [#,#,#] -> [B#,S#,G#]
    }else if(ruleSections[2]&&ruleSections[2][0]!=="G"){
      //Prepend a G to section 2 if it is missing
      ruleSections[2]="G"+ruleSections[2];// [B,S,#]] -> [B,S,G#]
      postMessage({type: "alert", value:"Warning: a \"G\" was inserted into the rulestring to convert it into B/S/G form."});
    }
    ruleSections=ruleSections.sort((a,b) => "BSG".indexOf(a[0])-"BSG".indexOf(b[0]));// [G,B,S] -> [B,S,G]
    if(ruleSections[1][0]==="G"){
      if(ruleSections[0][0]==="B"){
        ruleSections.splice(1, 0, "S");
        postMessage({type: "alert", value:"Warning: an \"S\" was inserted into the rulestring to convert it into B/S/G form."});
      }
      if(ruleSections[0][0]==="S"){
        ruleSections.splice(0, 0, "B");
        postMessage({type: "alert", value:"Warning: a \"B\" was inserted into the rulestring to convert it into B/S/G form."});
      }
    }

    //sort, shorten, and filter the transitions into INT format
    for(let i=0;i<ruleSections.length||i<2;i++){
      console.log(ruleSections);
      ruleSections[i]=ruleSections[i].split(/(?=[0-8])|(?<=\/)/g).map(element => {
        if(/[BSG]/g.test(element)||/4[aceijknqrtwyz]{7}(?=[0-8]|\/|$)/g.test(element))
          return element.split("").sort().join("");
        const n=parseInt(element[0]);
        const transitions=[...new Set(element.slice(1).split(""))];
        return n+table[n].filter(letter => (transitions.indexOf(letter)===-1)===(transitions.length>=table[n].length/2)).join("");//n+stack.join("");
      });
      ruleSections[i]=ruleSections[i].join("").replace(/-(?=[0-8]|\/|$)/g,"");
    }
    return ruleSections.join("/")+(suffix??"");
  }catch (error){
    postMessage({type: "alert", value:"Unable to parse rule \"" + dirtyString + "\". \nThis program supports rulestrings in B/S, S/B, #/#, B#/S#/G#, or #/#/# format with an optional \"History\" suffix. \nMaybe there's a missing character?"});
    return "B3/S23";
  }
}

var runningSimulation = false;
var rendering = false;
onmessage = (e) => {
	switch(e.data.type){
		case "setRule": setRule(e.data.args); break;
    case "setSpeed": simulationSpeed = e.data.value; console.log(simulationSpeed); break;
		case "writeCell":
      console.log("received");
			if(GRID.type===0){
        expandGridToCell(e.data.args[0], e.data.args[1]);//technically redundant, writeCell() does it, might help with draw latency
        postMessage({id:e.data.id, response:{index: e.data.args[2], state:getCellValue(GRID.head, e.data.args[0], e.data.args[1])}});
      }else{
        postMessage({id:e.data.id, response:{index: e.data.args[2], state:GRID.finiteArray[e.data.args[0]-GRID.finiteArea.left+GRID.finiteArea.margin][e.data.args[1]-GRID.finiteArea.top+GRID.finiteArea.margin]}});
      }
			sendVisibleCells();
			break;
		case "drawList":
			let { id, editList} = e.data;
			//TODO: fix bug where edits before rule is loaded are not saved before the reset point
      for (cell of editList) cell.oldState = writeCell(cell.x, cell.y, cell.newState);
			//TODO: maybe change this back into a draw event if you can figure out why it's broken
			currentEvent=new EventNode(currentEvent, Date.now()/*, "draw", cellList*/);
			postMessage({id:id, response:editList});
			sendVisibleCells();
			break;
		case "move":
			view = e.data.view;
			if(!runningSimulation)sendVisibleCells();
			break;
		case "stepSize": stepSize = e.data.args[0]; break;
		case "start":
			runningSimulation = true;
			loop();
			break;
		case "stop": runningSimulation = false; break;
		case "import":
			console.time("import RLE");
			postMessage({id:e.data.id, response:importRLE(e.data.args)});
			console.timeEnd("import RLE"); 
			sendVisibleCells();
			break;
		case "export":{
			console.time("export RLE"); 
      let pattern=[[]];
			console.log(e.data);
      switch(e.data.sourcePattern){
        case "Grid":
				pattern = readPattern(new Area(...calculateBounds(GRID)));
        break;
				default:
				pattern = readPattern(e.data.sourcePattern);
      }
      switch(e.data.textFormat){
        case "RLE":
					postMessage({id:e.data.id, response:patternToRLE(pattern, e.data.ruleFormat)});
        break;
        case "LZ77":
        break;
      }
			console.timeEnd("export RLE"); 
			break;
    }
		case "setGrid":
			console.time("changing GRID type"); 
			console.log(e.data);
			if(GRID.type!==e.data.grid)postMessage({id:e.data.id, response:setGridType(e.data.grid)});
			console.timeEnd("changing GRID type"); 
			break;
		case "transformClippedPattern":
			clipboard[e.data.clipboard].pattern=e.data.pattern;
			break;
		case "copy":
		case "cut":{
      let pattern=readPattern(e.data.area);
			postMessage({id:e.data.id, response:pattern});
      clipboard[e.data.clipboard].pattern=pattern;
      console.log(pattern);
			if(e.data.type==="copy")break;
    }
		case "clear":
      let clearedArray = new Array(e.data.area.right-e.data.area.left);
      for(let i=0; i< clearedArray.length; i++){
        clearedArray[i]=new Array(e.data.area.bottom-e.data.area.top);
        clearedArray[i].fill(0);
      }
			currentEvent=writePatternAndSave(e.data.area.left,e.data.area.top,clearedArray);
			sendVisibleCells();
      break;
		case "invert":
		case "increment":
			let pattern = readPattern(new Area(e.data.area.top-1,e.data.area.right+1,e.data.area.bottom+1,e.data.area.left-1), GRID);
      if(e.data.type==="increment")
        currentEvent=writePatternAndSave(e.data.area.left,e.data.area.top, iteratePattern(pattern,1,pattern.length-1,pattern[0].length-1,1));
      if(e.data.type==="invert"){
        let invertedArea=readPattern(e.data.area);

        for(let i=0; i<invertedArea.length; i++){
          for(let j=0; j<invertedArea[0].length; j++){
            if(invertedArea[i][j]===0||invertedArea[i][j]===1)invertedArea[i][j]=1-invertedArea[i][j];
          }
        }
        currentEvent=writePatternAndSave(e.data.area.left,e.data.area.top, invertedArea);
        console.log(currentEvent);
      }
			sendVisibleCells();
      break;
		case "randomize":
      let randomArray=new Array(e.data.area.right-e.data.area.left);
      for(let i=0;i<randomArray.length;i++){
        randomArray[i]=new Array(e.data.area.bottom-e.data.area.top);
        for(let j=0;j<randomArray[0].length;j++){
          if(Math.random()<e.data.randomFillPercent){
            randomArray[i][j]=1;
          }else{
            randomArray[i][j]=0;
          }
        }
      }

      currentEvent=writePatternAndSave(e.data.area.left,e.data.area.top, randomArray);
      sendVisibleCells();
      break;
		case "write":
			console.time("write pattern");
      // GRID.head = widenTree({top:e.data.args[1], right:e.data.args[0] + e.data.args[2][0].length, bottom:e.data.args[1] + e.data.args[2].length, left:e.data.args[0]});
			currentEvent=writePatternAndSave(e.data.args[0],e.data.args[1],clipboard[e.data.args[2]].pattern);
			postMessage({id:e.data.id});
			console.timeEnd("write pattern");
			sendVisibleCells();
			break;
		case "getBounds":
			postMessage({id:e.data.id, response:calculateBounds(GRID)});
			break;
    default:
      self[e.data.type](...e.data.args);
	}
}

function stepSimulation(){
	if(resetEvent===null){
		//creates an EventNode with all neccessary information representing gen 0, and saves a referece to it
		resetEvent=new EventNode(currentEvent.parent, "reset point");
		if("paste" in currentEvent)resetEvent.paste=currentEvent.paste;
		if("draw" in currentEvent)resetEvent.draw=currentEvent.draw;
		currentEvent=resetEvent;
		resetEvent.child=currentEvent.child;
		if(GRID.type!==0&&typeof(resetEvent.finiteArray)==="string")resetEvent.finiteArray=parseRLE(resetEvent.finiteArray).pattern;
	}
	for(let i=0;i<stepSize;i++) gen(GRID);
	currentEvent=new EventNode(currentEvent, "gen");
	sendVisibleCells();
}

function loop(){

	if(runningSimulation){
		// wasReset=false;
		// for(let i=0;i<document.getElementById("searchOptions").children.length-1;i++){
		// 	searchAction(document.getElementById("searchOptions").children[i]);
		// }
    
		stepSimulation();
    requestAnimationFrame(loop);
    // setTimeout(loop, 0.1*(100-simulationSpeed)*(100-simulationSpeed));
	}
}

function sendVisibleCells(){
	if(GRID.type === 0){
		const  topBorder = Math.max(view.y+20-20/view.z-1, -GRID.head.distance/4),
		       rightBorder = Math.min(view.x+30+30/view.z+1, GRID.head.distance/4),
		       bottomBorder = Math.min(view.y+20+20/view.z+1, GRID.head.distance/4),
		       leftBorder = Math.max(view.x+30-30/view.z-1, -GRID.head.distance/4);
		let visiblePattern = [[]];
    if(rightBorder-leftBorder>0&&bottomBorder-topBorder>0)
      visiblePattern = readPatternFromTree(new Area(Math.ceil(topBorder), Math.ceil(rightBorder), Math.ceil(bottomBorder), Math.ceil(leftBorder)), GRID);
		postMessage({type:"render", top:topBorder, left:leftBorder, pattern:visiblePattern, population:GRID.head.population, generation:genCount, backgroundState:GRID.backgroundState});
	}else{
		const visiblePattern = GRID.finiteArray;
		postMessage({type:"render", top:GRID.finiteArea.top - GRID.finiteArea.margin, left:GRID.finiteArea.left - GRID.finiteArea.margin, pattern:visiblePattern, population:91, generation:genCount, backgroundState:GRID.backgroundState});
	}
}
