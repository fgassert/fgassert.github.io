//

Life = ((document, window) => {
  'use strict';

  let lifeEl;
  let canvas;
  let gl;
  let target;
  let textures;
  let framebuffers;
  let stepProgram;
  let renderProgram;
  let transformProgram;
  let renderTex;
  let renderFrame;

  let settings = {
    W: 512,
    H: 512,
    cellsize: 8,
    framerate: 60,
    initSteps: 5,
    lifeElementId: 'life',
    targetElementId: 'life-target'
  };

  let props = {
    frames: 0,
    steps: 0,
    lastTimestamp: 0,
    timeDelta: 0,
    fpsTimestamp: 0,
    fpsFrames: 0,
    fps: 0,
    speed: 4,
    rad: 80,
    texSize: null,
    stopped: true,
    drawing: -1,
    transform: null,
    cursor: null,
    timeout: null
  };

  let ui = {
    p1: null,
    p2: null,
    p3: null,
    startBtn: null,
    stepBtn: null,
    speedBtn: null,
    randomBtn: null,
    target: null,
    steps: null,
    framerate: null
  };

  const createElement = function(node, className, onClick, text) {
    let el = document.createElement(node);
    if (className) el.className = className;
    if (onClick) el.addEventListener('click', onClick, null);
    if (text) el.appendChild(document.createTextNode(text));
    return el;
  };

  const initUI = function() {
    lifeEl = document.getElementById(settings.lifeElementId);
    canvas = createElement('canvas', 'life-canvas');
    canvas.tabIndex = -1;

    ui.target = target = document.getElementById(settings.targetElementId) || canvas;
    ui.container = createElement('div', 'life-ui');
    ui.p1 = createElement('div', 'life-panel -top -right');
    ui.exitBtn = createElement('button', 'life-btnExit', (e)=>{setFullscreen(false);}, "Exit");

    ui.p2 = createElement('div', 'life-panel -bottom -left');
    ui.startBtn = createElement('button', 'life-btnStart -stopped', (e)=>{toggle();}, 'Play');
    ui.stepBtn = createElement('button', 'life-btnStep', (e)=>{step();}, 'Step');
    ui.speedBtn = createElement('button', 'life-btnSpeed', (e)=>{stepSpeed();}, 'Speed');
    ui.randomBtn = createElement('button', 'life-btnRandomize', (e)=>{randomize();}, 'Reset');

    ui.p3 = createElement('div', 'life-panel -top -left -transparent');
    ui.steps = createElement('p', null, null, 'Steps: 0');
    ui.framerate = createElement('p', null, null, 'Fps: 0.0');

    ui.p4 = createElement('div', 'life-panel -bottom -right -transparent');
    ui.info = createElement('button', 'life-btnInfo', null, 'What is this?');

    ui.p1.appendChild(ui.exitBtn);
    ui.p2.appendChild(ui.startBtn);
    ui.p2.appendChild(ui.stepBtn);
    ui.p2.appendChild(ui.speedBtn);
    ui.p2.appendChild(ui.randomBtn);
    //ui.p3.appendChild(ui.steps);
    //ui.p3.appendChild(ui.framerate);
    ui.p4.appendChild(ui.info);

    ui.container.appendChild(ui.p1);
    ui.container.appendChild(ui.p2);
    ui.container.appendChild(ui.p3);
    ui.container.appendChild(ui.p4);

    lifeEl.appendChild(canvas);
    lifeEl.appendChild(ui.container);

    const getRelativePosition = (e) => {
      return [e.offsetX + e.target.offsetLeft - ui.target.offsetLeft,
              e.offsetY + e.target.offsetTop - ui.target.offsetTop];
    };
    const getRelativeTouchPosition = (e) => {
      return [e.pageX - e.target.scrollLeft - ui.target.offsetLeft,
              e.pageY - e.target.scrollTop - ui.target.offsetTop];
    };

    const touchEnd = (e) => {
      if (props.drawing > -1) {
        setDrawing(-1);
      } else if (!props.fullscreen) {
        toggle();
      }
      e.preventDefault();
    };
    const touchMove = (e) => {
      if (e.changedTouches.length > 0) {
        let t = e.changedTouches.item(0);
        setCursor(...getRelativeTouchPosition(t));
        if (props.drawing < 0)
          setDrawing(getCursor());
        step();

      }
      e.preventDefault();
    };
    const touchStart = (e) => {e.preventDefault();};
    const mouseDown = (e) => {
      canvas.focus();
      setCursor(...getRelativePosition(e));
      setDrawing(getCursor());
      step();
      e.preventDefault();
    };
    const mouseMove = (e) => {
      if (props.drawing >= 0) {
        setCursor(...getRelativePosition(e));
        step();
      }
    };
    const mouseUp = (e) => {setDrawing(-1);};
    const mouseOver = (e) => {
      start();
      props.timeout = setTimeout(()=>{setFullscreen(true);}, 5000);
    };
    const mouseOut = (e) => {
      if (!props.fullscreen) {
        setDrawing(-1);
        stop();
      }
      if (props.timeout)
        clearTimeout(props.timeout);
    };
    const resize = (e) => {rescale(); render();};
    const keypress = (e) => {
      if (e.key == 'Escape') {
        setFullscreen(false);
      } else if (e.key == 'f') {
        setFullscreen(true);
      } else if (e.key == 'p') {
        toggle();
      } else if (e.key == 's') {
        step();
      } else if (e.key == 'r') {
        randomize();
      }
    };

    target.addEventListener('touchend', touchEnd, null);
    canvas.addEventListener('touchend', touchEnd, null);
    target.addEventListener('touchmove', touchMove, null);
    canvas.addEventListener('touchmove', touchMove, null);
    target.addEventListener('touchstart', touchStart, null);
    canvas.addEventListener('touchstart', touchStart, null);

    target.addEventListener('mousemove', mouseMove, null);
    target.addEventListener('mousedown', mouseDown, null);
    target.addEventListener('mouseup', mouseUp, null);
    canvas.addEventListener('mousemove', mouseMove, null);
    canvas.addEventListener('mousedown', mouseDown, null);
    canvas.addEventListener('mouseup', mouseUp, null);
    target.addEventListener('mouseout', mouseOut, null);
    target.addEventListener('mouseover', mouseOver, null);

    window.addEventListener('resize', resize, null);
    canvas.addEventListener('keydown', keypress, null);
  };

  const init = function(options) {
    options && Object.assign(options, settings);
    initUI();

    gl = canvas.getContext('webgl');
    if (!gl) {
      console.log('No webgl :(');
      return false;
    };

    stepProgram = new glProgram(gl, vShaderSrc, stepShaderSrc, {
      draw_mode: gl.TRIANGLE_STRIP,
      attributes: {
        a_position: rectArray(-1, -1, 2, 2),
        a_texCoord: rectArray(0, 0, 1, 1)
      },
      uniforms: {
        u_texsize: [settings.W, settings.H],
        u_drawing: -1,
        u_cursor: [0, 0]
      }
    });
    renderProgram = new glProgram(gl, vShaderSrc, renderShaderSrc, {
      draw_mode: gl.TRIANGLE_STRIP,
      attributes: {
        a_position: rectArray(-1, -1, 2, 2)
      },
      uniforms: {
        u_texsize: [settings.W, settings.H],
        u_cellsize: settings.cellsize,
        u_center: [0, 0],
        u_rad: 0,
        u_fullscreen: 0,
        u_shimmer: 0
      }
    });
    transformProgram = new glProgram(gl, transformShaderSrc, transformFragmentSrc, {
      draw_mode: gl.TRIANGLE_STRIP,
      attributes: {
        a_position: rectArray(-1, -1, 2, 2),
        a_texCoord: rectArray(0, 0, 1, 1)
      },
      uniforms: {
        u_transform: new mat3().values()
      }
    });

    const data = randomData(settings.W, settings.H);
    const texOptions = {
      width: settings.W,
      height: settings.H,
      parameters: {
        0x2800: gl.NEAREST, //TEXTURE_MAG_FILTER
        0x2801: gl.NEAREST, //TEXTURE_MIN_FILTER
        0x2802: gl.REPEAT, //TEXTURE_WRAP_S
        0x2803: gl.REPEAT //TEXTURE_WRAP_T
      }
    };

    const t1 = stepProgram.newTexture(data, texOptions);
    const t2 = stepProgram.newTexture(null, texOptions);
    const f1 = stepProgram.newFramebuffer(t1);
    const f2 = stepProgram.newFramebuffer(t2);

    textures = [t1, t2];
    framebuffers = [f1, f2];

    renderTex = renderProgram.newTexture(null, {
      width: canvas.width,
      height: canvas.height,
      parameters: {
        0x2800: gl.LINEAR, //TEXTURE_MAG_FILTER
        0x2801: gl.LINEAR, //TEXTURE_MIN_FILTER
        0x2802: gl.CLAMP_TO_EDGE, //TEXTURE_WRAP_S
        0x2803: gl.CLAMP_TO_EDGE //TEXTURE_WRAP_T
      }
    });
    renderFrame = renderProgram.newFramebuffer(renderTex);

    for (let i=0; i<settings.initSteps; i++)
      _step();
    rescale();
    requestAnimationFrame(main);
    return this;
  };

  const _getStep = function() {
    return props.steps % 2;
  };

  const _step = function() {
    const i = _getStep();
    stepProgram.use();
    stepProgram.setTexture(textures[i]);
    stepProgram.setFramebuffer(framebuffers[1-i], settings.W, settings.H);
    stepProgram.draw();
    //ui.steps.textContent = "Steps: " + props.steps;
    props.steps++;
  };

  const render = function(frameOffset) {
    const i = _getStep();
    frameOffset = frameOffset || 0;
    renderProgram.use();
    renderProgram.setUniform('u_shimmer', (frameOffset*frameOffset/25.0));
    renderProgram.setTexture(textures[i]);
    renderProgram.setFramebuffer(renderFrame, props.texSize, props.texSize);
    renderProgram.draw();
    transformProgram.use();
    transformProgram.setTexture(renderTex);
    transformProgram.setFramebuffer(null, canvas.width, canvas.height);
    transformProgram.draw();
  };

  const main = function(t) {
    const timestep = 1000/settings.framerate;
    if (t < props.lastTimestamp + timestep) {
      requestAnimationFrame(main);
      return;
    }
    props.timeDelta += t - props.lastTimestamp;
    props.lastTimestamp = t;

    let iter = 0;
    while (props.timeDelta >= timestep) {
      let stepFrame = props.frames % props.speed;
      if (props.transition) _transition();
      if (!props.stopped && stepFrame == 0)
        _step();
      if (!props.stopped || props.transition) {
        render(stepFrame / props.speed);
      }
      props.timeDelta -= timestep;
      props.frames++;
      if (iter > 2) {
        props.timeDelta = 0;
        break;
      }
    }

    if (t > props.fpsTimestamp + 500) {
      props.fps = (props.frames - props.fpsFrames) + props.fps / 2;
      //ui.framerate.textContent = "Fps: " + props.fps.toFixed(1);
      props.fpsTimestamp = t;
      props.fpsFrames = props.frames;
    }

    requestAnimationFrame(main);
  };

  const start = function() {
    if (props.stopped) {
      props.stopped = false;
    }
    if (ui.startBtn) {
      ui.startBtn.classList.remove('-stopped');
      ui.startBtn.textContent = 'Pause';
    }
  };

  const stop = function() {
    props.stopped = true;
    if (ui.startBtn) {
      ui.startBtn.classList.add('-stopped');
      ui.startBtn.textContent = 'Play';
    }
  };

  const step = function() {
    _step();
    render();
  };

  const toggle = function() {
    if (props.stopped) {
      start();
    } else {
      stop();
    }
  };

  const setFullscreen = function(state) {
    props.fullscreen = state;
    if (state) {
      canvas.focus();
      lifeEl.classList.add('-fullscreen');
      props.transition = true;
    } else {
      if (props.timeout) clearTimeout(props.timeout);
      renderProgram.setUniform('u_fullscreen', state);
      lifeEl.classList.remove('-fullscreen');
      stop();
      rescale();
      }
  };

  const _transition = function() {
    if (!props.fullscreen ) {
      rescale();
      return;
    } else if (props.rad >= Math.max(canvas.clientWidth, canvas.clientHeight)*2) {
      props.transition = false;
      renderProgram.setUniform('u_fullscreen', 1);
    } else {
      setRenderRadius(props.rad*1.1/2);
    }
  };

  const stepSpeed = function(speed) {
    if (speed) {
      props.speed = speed;
    } else if (props.speed <= 1) {
      props.speed = 4 * 4;
    } else {
      props.speed /= 4;
    };
  };

  const randomize = function() {
    const data = randomData(settings.W, settings.H);
    props.steps = 0;
    stepProgram.updateTexture(textures[_getStep()], data,
                              {width: settings.W, height: settings.H});
    for (let i=0; i<settings.initSteps; i++) {
      _step();
    }
    render();
  };

  const setCursor = function(x, y) {
    props.cursor = client2grid(x, y);
    stepProgram.setUniform('u_cursor', props.cursor);
  };

  const _getCursor = function(x, y) {
    if (x !== undefined && y !== undefined) {
      props.cursor = client2grid(x, y);
    }
    stepProgram.setFramebuffer(framebuffers[_getStep()], settings.W, settings.H);
    const gx = Math.floor(((props.cursor[0]) % settings.W + settings.W) % settings.W);
    const gy = Math.floor(((props.cursor[1]) % settings.H + settings.H) % settings.H);
    const data = stepProgram.readPixels(gx, gy);
    return data;
  };

  const getCursor = function(x, y) {
    return _getCursor(x, y)[0] < 255 ? 1: 0;
  };

  const setDrawing = function(state) {
    props.drawing = state;
    stepProgram.setUniform('u_drawing', state);
  };

  const setCellsize = function(cellsize) {
    settings.cellsize = cellsize;
    renderProgram.setUniform('u_cellsize', cellsize);
    render();
  };

  const setRenderRadius = function(r) {
    props.rad = r * 2;
    renderProgram.setUniform('u_rad', r);
  };

  const rescale = function() {
    const x = canvas.clientWidth;
    const y = canvas.clientHeight;
    const t = target.offsetTop;
    const l = target.offsetLeft;
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    const dpr = x < 1024 ? window.devicePixelRatio || 1 : 1;

    props.transform = new mat3();
    props.transform.rotate(Math.PI/4).translate(l+w/2, t+h/2).normalize(x, y, true);

    const ts = Math.max(x, y);
    props.transition = false;
    props.texSize = ts * 2;
    props.rad = w/2;

    canvas.width = x * dpr;
    canvas.height = y * dpr;

    renderProgram.setUniform('u_rad', w/2);
    renderProgram.setUniform('u_center', [ts, ts]);
    renderProgram.updateTexture(renderTex, null, {width:ts*2, height:ts*2});
    transformProgram.setUniform('u_transform', props.transform.values());
    transformProgram.setAttribute('a_position', rectArray(-ts, -ts, ts*2, ts*2));
    render();
  };

  const client2grid = function(x, y, cellsize) {
    /*
      the computational texture is in cartesian space with
      0,0 at the center of the canvas.

      to get cell coordinates from client coordinates,
      subtract center, divide by cell size, and reverse rotation.
    */
    cellsize = cellsize || settings.cellsize;
    const t = new mat3().translate(-target.clientWidth/2, -target.clientHeight/2)
          .scale(1/cellsize)
          .rotate(-Math.PI/4)
          .translate(.5,.5);
    const xy = t.project(x, y);
    return xy;
  };

  const rectArray = function(left, bottom, width, height) {
    return new Float32Array(
      [left, bottom,
       left, bottom + height,
       left + width, bottom,
       left + width, bottom + height]);
  };

  const circleArray = function(x, y, radius, faces) {
    x = x || 0;
    y = y || 0;
    radius = radius || 1;
    faces = faces ? faces : 12;
    let data = [];
    for (let i = 0; i < faces; i++) {
      data.push(x + radius * Math.sin(i/faces * 2 * Math.PI));
      data.push(y + radius * Math.cos(i/faces * 2 * Math.PI));
    };
    return new Float32Array(data);
  };

  const rPentominoData = function(w, h) {
    const coords = [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [1, 2]
    ];
    return getData(w, h, coords);
  };

  const acornData = function(w, h) {
    const coords = [
      [1, 0],
      [3, 1],
      [0, 2],
      [1, 2],
      [4, 2],
      [5, 2],
      [6, 2],
    ];
    return getData(w, h, coords);
  };

  const getData = function(w, h, coords) {
    let data = new Uint8Array(w * h * 4);
    for (let i in coords)
      data[coords[i][0]* 4 + coords[i][1]*w*4] = 255;
    return data;
  };

  const randomData = function(w, h) {
    const size = w * h * 4;
    let data = new Uint8Array(size);
    for (let i = 0; i < size; i++)
      data[i] = Math.random() > 0.5 ? 255 : 0;
    return data;
  };

  const vShaderSrc = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0, 1);
  v_texCoord = a_texCoord;
}
`;

  const renderShaderSrc = `
precision mediump float;
uniform vec2 u_texsize;
uniform sampler2D u_image;

uniform float u_cellsize;
uniform vec2 u_center;
uniform float u_rad;
uniform int u_fullscreen;
uniform float u_shimmer;

varying vec2 v_texCoord;

void main() {
  vec2 pos = gl_FragCoord.xy - u_center;

  // clip to grid inside circle
  vec2 grid_pos = floor(pos / u_cellsize + .5);
  float rad = floor(u_rad / u_cellsize);

  if (u_fullscreen > 0 || dot(grid_pos, grid_pos) < rad*rad) {
    if (u_cellsize > 2. && (
      mod(pos.x + u_cellsize/2., u_cellsize) < 1. ||
      mod(pos.y + u_cellsize/2., u_cellsize) < 1.)) {
      gl_FragColor = vec4(1,1,1,1);
    } else {
      vec4 val = texture2D(u_image, (grid_pos+.5) / u_texsize);
      if (val.x >= 1.) {
        gl_FragColor = vec4(.2, cos(1.), sin(1.5), 1);
      } else if (val.x > 0.1) {
        gl_FragColor = vec4(.2, cos(val.x), sin(val.x*1.5),1) * (val.x - u_shimmer) +
                       vec4(.95, .95, .98, 1) * (1.-val.x);
      } else {
        gl_FragColor = vec4(.95, .95, .98, 1);
      }
    }
  }
}
`;

  const stepShaderSrc = `
precision mediump float;
uniform vec2 u_texsize;
varying vec2 v_texCoord;

uniform sampler2D u_image;
uniform int u_drawing;
uniform vec2 u_cursor;

void main() {
  vec2 pos = v_texCoord;
  vec2 one_px = vec2(1, 1) / u_texsize;

  if (u_drawing > -1) {
    vec2 dpos = pos * u_texsize - mod(u_cursor, u_texsize);
    if (abs(dpos.x) < .5 && abs(dpos.y) < .5) {
      gl_FragColor = vec4(u_drawing, 1, 0, 1);
    } else {
      gl_FragColor = texture2D(u_image, pos);
    }
  } else {
    float c = texture2D(u_image, pos).x;
    int sum = -int(c);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        sum += int(texture2D(u_image, pos + vec2(i, j) * one_px).x);
      }
    }
    int v = (sum < 2 || sum > 3 ? 0 : sum == 3 ? 1 : c < 1. ? 0 : 1);
    gl_FragColor = vec4(v < 1 ? c * .5 : 1., 0, 0, 1);
  }
}
`;

  const transformShaderSrc = `
uniform mat3 u_transform;
attribute vec2 a_position;
attribute vec2 a_texCoord;

varying vec2 v_texCoord;

void main() {
  gl_Position = vec4((u_transform * vec3(a_position, 1)).xy, 0, 1);
  v_texCoord = a_texCoord;
}
`;

  const transformFragmentSrc = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_image;

void main() {
  gl_FragColor = texture2D(u_image, v_texCoord);
}
`;

  const glProgram = function(gl, vshader, fshader, options) {
    this.init(gl, vshader, fshader, options);
    return this;
  };

  glProgram.prototype = {
    init: function(gl, vshader, fshader, options) {
      this.gl = gl;
      const program = this.program = gl.createProgram();
      this.a_info = {};
      this.u_info = {};
      this.addShader(gl.VERTEX_SHADER, vshader);
      this.addShader(gl.FRAGMENT_SHADER, fshader);
      this.gl.linkProgram(program);
      this.use();
      this._readProgramInfo();

      if (options.uniforms)
        for (let u in options.uniforms)
          this.setUniform(u, options.uniforms[u]);
      if (options.uniforms)
        for (let a in options.attributes)
          this.setAttribute(a, options.attributes[a]);
      if (options.draw_mode)
        this.draw_mode = options.draw_mode;
      return this;
    },

    use: function() {
      this.gl.useProgram(this.program);
    },

    draw: function(mode, first, count) {
      this.use();
      mode = mode || this.draw_mode;
      first = first || 0;
      let max_count = 0;
      for (let attr in this.a_info) {
        let a = this.a_info[attr];
        if (a.buffer) {
          this.gl.bindBuffer(this.gl.ARRAY_BUFFER, a.buffer);
          this.gl.enableVertexAttribArray(a.loc);
          this.gl.vertexAttribPointer(
            a.loc, a.v_info.size, a.v_info.type, false, 0, 0);
          max_count = a.count > max_count ? a.count : max_count;
        }
      }
      count = count || max_count;
      this.gl.drawArrays(mode, first, count);
    },

    addShader: function(type, src) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, src);
      this.gl.compileShader(shader);
      this.gl.attachShader(this.program, shader);
    },

    setUniform: function(name, value) {
      const u = this.u_info[name];
      this.use();
      u && u.set ? u.set(value) : console.log('invalid uniform: ' + name);
    },

    setAttribute: function(name, data, hint) {
      hint = hint || this.gl.STATIC_DRAW;
      if (data instanceof Array)
        data = new Float32Array(data);

      if (this.a_info[name]) {
        if (this.a_info[name].buffer){
          this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.a_info[name].buffer);
          this.gl.bufferData(this.gl.ARRAY_BUFFER, data, hint);
        } else {
          this.a_info[name].buffer = this.newBuffer(data, hint);
        }
      } else
        console.log('invalid attribute' + name);
      this.a_info[name].count = data.length / this.a_info[name].v_info.size;
    },

    setTexture: function(texture, i) {
      if (i !== undefined)
        this.gl.activeTexture(gl.TEXTURE0 + i);
      this.gl.bindTexture(gl.TEXTURE_2D, texture);
    },

    setFramebuffer: function(framebuffer, width, height) {
      this.gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      this.gl.viewport(0, 0, width, height);
    },

    setDrawMode: function(mode) {
      this.draw_mode = mode;
    },

    readPixels: function(x, y, width, height) {
      width = width || 1;
      height = height || 1;
      let data = new Uint8Array(width * height * 4);
      this.gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    },

    newBuffer: function(data, hint) {
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, data, hint);
      return buffer;
    },

    newTexture: function(data, options) {
      const texture = this.gl.createTexture();
      return this.updateTexture(texture, data, options);
    },

    updateTexture: function(texture, data, options) {
      const defaults = {
        target: this.gl.TEXTURE_2D,
        level: 0,
        parameters: {},
        format: this.gl.RGBA,
        type: this.gl.UNSIGNED_BYTE
      };
      options = Object.assign(defaults, options);

      this.gl.bindTexture(options.target, texture);
      if (options.width && options.height) {
        this.gl.texImage2D(options.target, options.level, options.format,
                           options.width, options.height, 0,
                           options.format, options.type, data);
      } else {
        this.gl.texImage2D(options.target, options.level, options.format,
                           options.format, options.type, data);
      }
      for (let p in options.parameters)
        this.gl.texParameteri(options.target, p, options.parameters[p]);
      return texture;
    },

    newFramebuffer: function(texture) {
      const framebuffer = this.gl.createFramebuffer();
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return framebuffer;
    },

    new: function(vshader, fshader, options) {
      return new ProgramWrapper(options);
    },

    _addShader: function(type, src) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, src);
      this.gl.compileShader(shader);
      this.gl.attachShader(this.program, vshader);
    },

    _readProgramInfo: function() {
      const num_u = this.gl.getProgramParameter(
        this.program, this.gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < num_u; i++) {
        let u = this.gl.getActiveUniform(this.program, i);
        const l = u.loc = this.gl.getUniformLocation(this.program, u.name);
        u.set = u.size == 1 ? {
          0x1404: (v) => this.gl.uniform1i(l, v), //'INT',
          0x8B53: (v) => this.gl.uniform2i(l, ...v), //'INT_VEC2'
          0x8B54: (v) => this.gl.uniform3i(l, ...v), //'INT_VEC3'
          0x8B55: (v) => this.gl.uniform4i(l, ...v), //'INT_VEC4'
          0x1406: (v) => this.gl.uniform1f(l, v), //'FLOAT'
          0x8B50: (v) => this.gl.uniform2f(l, ...v), //'FLOAT_VEC2'
          0x8B51: (v) => this.gl.uniform3f(l, ...v), //'FLOAT_VEC3'
          0x8B52: (v) => this.gl.uniform4f(l, ...v),  //'FLOAT_VEC4'
          0x8B5A: (v) => this.gl.uniformMatrix2fv(l, false, v), //'FLOAT_MAT2'
          0x8B5B: (v) => this.gl.uniformMatrix3fv(l, false, v), //'FLOAT_MAT3'
          0x8B5C: (v) => this.gl.uniformMatrix4fv(l, false, v)  //'FLOAT_MAT4'
        }[u.type] : {
          0x1404: (v) => this.gl.uniform1iv(l, v), //'INT',
          0x8B53: (v) => this.gl.uniform2iv(l, v), //'INT_VEC2'
          0x8B54: (v) => this.gl.uniform3iv(l, v), //'INT_VEC3'
          0x8B55: (v) => this.gl.uniform4iv(l, v), //'INT_VEC4'
          0x1406: (v) => this.gl.uniform1fv(l, v), //'FLOAT'
          0x8B50: (v) => this.gl.uniform2fv(l, v), //'FLOAT_VEC2'
          0x8B51: (v) => this.gl.uniform3fv(l, v), //'FLOAT_VEC3'
          0x8B52: (v) => this.gl.uniform4fv(l, v), //'FLOAT_VEC4'
          0x8B5A: (v) => this.gl.uniformMatrix2fv(l, false, v), //'FLOAT_MAT2'
          0x8B5B: (v) => this.gl.uniformMatrix3fv(l, false, v), //'FLOAT_MAT3'
          0x8B5C: (v) => this.gl.uniformMatrix4fv(l, false, v)  //'FLOAT_MAT4'
        }[u.type];
        this.u_info[u.name] = u;
      }
      const num_a = this.gl.getProgramParameter(
        this.program, this.gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < num_a; i++) {
        let a = this.gl.getActiveAttrib(this.program, i);
        a.loc = this.gl.getAttribLocation(this.program, a.name);
        a.v_info = {
          0x1406: {type: a.type, size: 1}, //'FLOAT'
          0x8B50: {type: this.gl.FLOAT, size: 2}, //'FLOAT_VEC2'
          0x8B51: {type: this.gl.FLOAT, size: 3}, //'FLOAT_VEC3'
          0x8B52: {type: this.gl.FLOAT, size: 4}, //'FLOAT_VEC4'
          0x8B5A: {type: a.type, size: 4}, //'FLOAT_MAT2',
          0x8B5B: {type: a.type, size: 9}, //'FLOAT_MAT3',
          0x8B5C: {type: a.type, size: 16} //'FLOAT_MAT4',
        }[a.type];
        this.a_info[a.name] = a;
      }
    }
  };

  const mat3 = function(data) {
    this.data = (data === undefined) ? this.identity() :
      new Float32Array(this.validate(data));
    return this;
  };

  mat3.prototype = {
    values: function() {return this.data || this.identity();},
    validate: function(data) {
      if (data instanceof mat3)
        return data.data;
      if ((data instanceof Array || data instanceof Float32Array) &&
          data.length === 9)
        return data;;
      throw "Data not Array-like length 9";
    },
    fromTransform: function(scale, rotate, translate) {
      const [sx, sy] = (typeof(scale) == 'number') ? [scale, scale] : scale;
      const s = Math.sin(rotate);
      const c = Math.cos(rotate);
      return new Float32Array(
        [sx * c, sx * -s, 0,
         sy * s, sy * c,  0,
         tx,     ty,      1]);
    },
    identity: function() {
      return new Float32Array(
        [1, 0, 0,
         0, 1, 0,
         0, 0, 1]);
    },
    scaling: function(sx, sy) {
      sy = sy || sx;
      return new Float32Array(
        [sx, 0, 0,
         0, sy, 0,
         0, 0, 1]);
    },
    rotation: function(rad) {
      const s = Math.sin(rad);
      const c = Math.cos(rad);
      return new Float32Array(
        [c, -s, 0,
         s, c, 0,
         0, 0, 1]);
    },
    translation: function(tx, ty) {
      return new Float32Array(
        [1, 0, 0,
         0, 1, 0,
         tx, ty, 1]);
    },
    normalizing: function(w, h, flipY) {
      const flip = flipY ? -1 : 1;
      return new Float32Array(
        [2/w, 0, 0,
         0, 2/h * flip, 0,
         -1, -1 * flip, 1]);
    },
    add: function(m1, m2) {
      m1 = this.validate(m1);
      if (typeof(m2) === 'number')
        return m1.map(x => x + m2);
      m2 = this.validate(m2);
      return new Float32Array(
        [m1[0]+m2[0], m1[1]+m2[1], m1[2]+m2[2],
         m1[3]+m2[3], m1[4]+m2[4], m1[5]+m2[5],
         m1[6]+m2[6], m1[7]+m2[7], m1[8]+m2[8]]);
    },
    mult: function(m1, m2) {
      m1 = this.validate(m1);
      if (typeof(m2) === 'number')
        return m1.map(x => x * m2);
      m2 = this.validate(m2);
      return new Float32Array(
        [m1[0]*m2[0] + m1[1]*m2[3] + m1[2]*m2[6],
         m1[0]*m2[1] + m1[1]*m2[4] + m1[2]*m2[7],
         m1[0]*m2[2] + m1[1]*m2[5] + m1[2]*m2[8],
         m1[3]*m2[0] + m1[4]*m2[3] + m1[5]*m2[6],
         m1[3]*m2[1] + m1[4]*m2[4] + m1[5]*m2[7],
         m1[3]*m2[2] + m1[4]*m2[5] + m1[5]*m2[8],
         m1[6]*m2[0] + m1[7]*m2[3] + m1[8]*m2[6],
         m1[6]*m2[1] + m1[7]*m2[4] + m1[8]*m2[7],
         m1[6]*m2[2] + m1[7]*m2[5] + m1[8]*m2[8]]);
    },
    times: function(x) {
      return this.mult(this.values(), x);
    },
    plus: function(x) {
      return this.add(this.values(), x);
    },
    scale: function(x, y) {
      this.data = this.times(this.scaling(x, y));
      return this;
    },
    rotate: function(rad) {
      this.data = this.times(this.rotation(rad));
      return this;
    },
    translate: function(x, y) {
      this.data = this.times(this.translation(x, y));
      return this;
    },
    normalize: function(width, height, flipY) {
      this.data = this.times(this.normalizing(width, height, flipY));
      return this;
    },
    project: function(x, y) {
      const m1 = this.data;
      return new Float32Array(
        [m1[0]*x + m1[3]*y + m1[6],
         m1[1]*x + m1[4]*y + m1[7]]);
    }
  };

  return {
    init: init,
    start: start,
    stop: stop,
    step: step,
    randomize: randomize,
    setFullscreen: setFullscreen,
    setCellsize: setCellsize,
    gl: () => {return(gl);},
    m3: mat3
  };
})(document, window).init();
