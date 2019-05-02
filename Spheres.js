var gl;
var canvas;
var shaderProgram;

var days=0;


// Create a place to store sphere geometry
var sphereVertexPositionBuffer;

//Create a place to store normals for shading
var sphereVertexNormalBuffer;

// View parameters
var eyePt = vec3.fromValues(0.0,0.0,150.0);
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
var up = vec3.fromValues(0.0,1.0,0.0);
var viewPt = vec3.fromValues(0.0,0.0,0.0);

// Create the normal
var nMatrix = mat3.create();

// Create ModelView matrix
var mvMatrix = mat4.create();
var mvMatrixStack = [];

//Create Projection matrix
var pMatrix = mat4.create();

// Sphere stack
var sphereStack = [];

// create a date object to keep track of ellapsed time, current time, previous time, ellapsed time (ms)
var timeElapsed = 0;
var timePrev = 0;
var timeCurr = Date.now();

// two counters to make sure we dont exceed the number of spheres gpu can handle
var totalCount = 0;
var maxCount = 200;

// add the friction constant as a global variable here
var friction = 0.50;

// sphere object;
var sphere;
//-------------------------------------------------------------------------
/* Generate sphere mesh and create buffers
 *
 */
function setupSphereBuffers() {
    
    var sphereSoup=[];
    var sphereNormals=[];
    var numT=sphereFromSubdivision(6,sphereSoup,sphereNormals);
	
    //console.log("Generated ", numT, " triangles"); 
    sphereVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);      
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereSoup), gl.STATIC_DRAW);
    sphereVertexPositionBuffer.itemSize = 3;
    sphereVertexPositionBuffer.numItems = numT*3;
	
    //console.log(sphereSoup.length/9);
    
    // Specify normals to be able to do lighting calculations
    sphereVertexNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereNormals),
                  gl.STATIC_DRAW);
    sphereVertexNormalBuffer.itemSize = 3;
    sphereVertexNormalBuffer.numItems = numT*3;
    
    //console.log("Normals ", sphereNormals.length/3);     
}

//-------------------------------------------------------------------------
/* Draw sphere
 *
 */
function drawSphere(){
 gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
 gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, sphereVertexPositionBuffer.itemSize, 
                         gl.FLOAT, false, 0, 0);

 // Bind normal buffer
 gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
 gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, 
                           sphereVertexNormalBuffer.itemSize,
                           gl.FLOAT, false, 0, 0);
 gl.drawArrays(gl.TRIANGLES, 0, sphereVertexPositionBuffer.numItems);      
}

//-------------------------------------------------------------------------
/* Upload mvMat to the shader
 *
 */
function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
}

//-------------------------------------------------------------------------
/* Upload pMat to shader
 *
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, 
                      false, pMatrix);
}

//-------------------------------------------------------------------------
/* Upload nMat to shader
 *
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

//----------------------------------------------------------------------------------
/* mvMat stack push
 *
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


//----------------------------------------------------------------------------------
/* mvMat stack pop
 *
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

//----------------------------------------------------------------------------------
/* Upload all mats to shader
 *
 */
function setMatrixUniforms() {
    uploadModelViewMatrixToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
}

//----------------------------------------------------------------------------------
/* Deg -> rad
 *
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

//----------------------------------------------------------------------------------
/* Create the webgl canvas
 *
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

//----------------------------------------------------------------------------------
/* Load the shader from DOM
 *
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);
  
  // If we don't find an element with the specified id
  // we do an early exit 
  if (!shaderScript) {
    return null;
  }
  
  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
 
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
 
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  } 
  return shader;
}

//----------------------------------------------------------------------------------
/* Setup the shaders
 *
 */
function setupShaders() {
  vertexShader = loadShaderFromDOM("shader-vs");
  fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");    
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");  
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
    
  shaderProgram.uniformAmbientMatColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientMatColor");  
  shaderProgram.uniformDiffuseMatColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseMatColor");
  shaderProgram.uniformSpecularMatColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularMatColor");    
    
}

//-------------------------------------------------------------------------
/* Upload the light to the shader
 *
 */
function uploadLightsToShader(loc,a,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

//----------------------------------------------------------------------------------
/* Call setup buffers
 *
 */
function setupBuffers() {
    setupSphereBuffers();     
}

//----------------------------------------------------------------------------------
/* Draw the spheres onto the canvas with class sphere params
 *
 */
function draw() {
	var transformVec = vec3.create();
  
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective 
    mat4.perspective(pMatrix,degToRad(45), gl.viewportWidth / gl.viewportHeight, 0.1, 200.0);

    // We want to look down -z, so create a lookat point in that direction    
    vec3.add(viewPt, eyePt, viewDir);
    // Then generate the lookat matrix and initialize the MV matrix to that view
    mat4.lookAt(mvMatrix,eyePt,viewPt,up);  
	
	for(var i = 0; i < sphereStack.length; i++){
		mvPushMatrix(); 
		vec3.set(transformVec,sphereStack[i].xPos, sphereStack[i].yPos, sphereStack[i].zPos);
		mat4.translate(mvMatrix, mvMatrix,transformVec);
		mat4.scale(mvMatrix, mvMatrix, [sphereStack[i].xScale, 
										sphereStack[i].yScale, 
										sphereStack[i].zScale]); 
		setMatrixUniforms();
		uploadLightsToShader([0,0, 0],[0.0,0.0,0.0],[sphereStack[i].color[0], 
													 sphereStack[i].color[1], 
													 sphereStack[i].color[2]], 
							 [0.3,0.3,0.3]);
		drawSphere();
		mvPopMatrix();
	}
}

//-----------------------------------------------------------------------------------
/**
* code begins here, add listeners and setup the canvas and sphere mesh
* @param {}
* @return {}
*/
function startup()
{
	// add the listener for the reset button, using keyboard
	window.addEventListener( 'keydown', onKeyDown, false );

	// add mouse for add sphere functionality, left click
	window.addEventListener( 'click', onClick, false );
    window.addEventListener('click', updatePartCountInput, false); 
    window.addEventListener('click', updateFricInput, true); 
	canvas = document.getElementById("myGLCanvas");
	gl = createGLContext(canvas);

	// set up shaders and buffers
	setupShaders();
	setupBuffers();
	gl.clearColor(0.5, 0.5, 0.5, 1.0);
	gl.enable(gl.DEPTH_TEST);

	// draw and reanimate the scene
	tick();
}

//----------------------------------------------------------------------------------
/* Update sphere positions based on Date.now()/1000 for seconds
 *
 */
function tick() {
	timePrev = timeCurr;
	timeCurr = Date.now();
	timeElapsed = timeCurr - timePrev;
	var timeS = timeElapsed/1000;
	requestAnimFrame(tick);
	for(var i = 0; i < sphereStack.length; ++i)
	{
		// update general position in all directions
		sphereStack[i].yPos += sphereStack[i].yVel * (timeS);
		sphereStack[i].xPos += sphereStack[i].xVel * (timeS);
		sphereStack[i].zPos += sphereStack[i].zVel * (timeS);

		// update the velocity from the acceleration in all directions, assume acceleration is fixed for now
		sphereStack[i].yVel += sphereStack[i].yAcc * (timeS);

		// impose drag in all directions
		sphereStack[i].yVel *= Math.pow(friction, (timeS));
		sphereStack[i].xVel *= Math.pow(friction, (timeS));
		sphereStack[i].zVel *= Math.pow(friction, (timeS));

		// collision with the ceiling
		if(sphereStack[i].yPos >= 35)
		{
			sphereStack[i].yVel = -sphereStack[i].yVel;
			sphereStack[i].yPos = 35;
		}

		// collision with the floor
		if(sphereStack[i].yPos <= -35)
		{ 
			if(0 > sphereStack[i].yVel && sphereStack[i].yVel > -7){
				sphereStack[i].yVel = 0;
				sphereStack[i].yAcc = 0;
			}
			else{
				sphereStack[i].yVel = -sphereStack[i].yVel;
			}
			sphereStack[i].yPos = -35;
		}

		// check for basic collisions in x direction, collision with right wall
		if(sphereStack[i].xPos >= 70)
		{
			sphereStack[i].xVel = -sphereStack[i].xVel;
			sphereStack[i].xPos = 70;
		}

		// collision with left wall
		else if(sphereStack[i].xPos <= -70)
		{
			sphereStack[i].xVel = -sphereStack[i].xVel;
			sphereStack[i].xPos = -70;
		}

		// check for basic collisions in z direction, collision with front wall
		if(sphereStack[i].zPos >= 35)
		{
			sphereStack[i].zVel = -sphereStack[i].zVel;
			sphereStack[i].zPos = 35;
		}

		// collision with back wall
		else if(sphereStack[i].zPos <= -35)
		{
			sphereStack[i].zVel = -sphereStack[i].zVel;
			sphereStack[i].zPos = -35;
		}
	}
	draw(); 
	
	
}

//----------------------------------------------------------------------------------
/* On mouse click function for adding particles
 * Also updates resistance values based on slider value
 */
function onClick() {
//	if(event.button == "0"){
//		for(var i = 0; i < document.getElementById("particle_number").value; i++){
//			// Push a new sphere onto the sphere stack
//			if(totalCount < document.getElementById("particle_max").value){
//                sphere = new Sphere(); 
//                sphereStack.push(sphere); 
//                totalCount++; 
//            }
//		}
//	}
    if(event.button == "0"){
            friction = document.getElementById("resistance").value/100; 
    }
}

//----------------------------------------------------------------------------------
/* Reset the sphere stack to 0
 *
 */
function onKeyDown(){
	if(event.keyCode == "32"){
		sphereStack.length = 0; 
		totalCount = 0; 
	}
    if(event.keyCode == "13") {
        for(var i = 0; i < document.getElementById("particle_number").value; i++){
			// Push a new sphere onto the sphere stack
			if(totalCount < document.getElementById("particle_max").value){
                sphere = new Sphere(); 
                sphereStack.push(sphere); 
                totalCount++; 
            }
		}
    }
}

//----------------------------------------------------------------------------------
/* Class construct for random sphere pos:(xyz) vel:(xyz) scale:(xyz) and color:(rgb)
 *
 */
class Sphere {
	constructor() {
		// Each sphere position
		this.xPos = getRandomArbitrary(-70, 70); 
		this.yPos = getRandomArbitrary(-35, 35); 
		this.zPos = getRandomArbitrary(-35, 35); 
		
		// Each sphere velocity
		this.xVel = getRandomArbitrary(-200, 200); 
		this.yVel = getRandomArbitrary(-200, 200); 
		this.zVel = getRandomArbitrary(-200, 200);
		
		// Each sphere size 
		var scale = getRandomArbitrary(1, document.getElementById("ball_size").value); 
		this.xScale = scale; 
		this.yScale = scale; 
		this.zScale = scale; 
		
		this.yAcc = -25;
    
		// flag will determine when the ball should stop bouncing in y direction
		this.color = [Math.random(), Math.random(), Math.random()]; 
		
	}
}

//----------------------------------------------------------------------------------
/* Returns random value between min max
 *
 */
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

//----------------------------------------------------------------------------------
/* Updates the friction slider value on canvas
 *
 */
function updateFricInput() {    document.getElementById('ball_resistance').value=document.getElementById("resistance").value; 
}

//----------------------------------------------------------------------------------
/* Updates particle counter on canvas
 *
 */
function updatePartCountInput() {
    document.getElementById('particle_count').value=sphereStack.length; 
}