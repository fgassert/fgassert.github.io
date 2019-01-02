//

Life = ((document, window) => {
  'use strict';

  // private props
  let canvas;
  let gl;
  let el;
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
    framerate: 24,
    initSteps: 5,
    radius: 80,
    canvasElementId: 'life',
    targetElementId: 'life-target'
  };

  let props = {
    cycles: 0,
    stopped: true,
    rescale: false,
    drawing: false,
    lastTimestamp: 0,
    transform: null
  };

  const init = function(options) {
    options && Object.assign(options, settings);
    canvas = document.getElementById(settings.canvasElementId);
    el = document.getElementById(settings.targetElementId);
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
        u_drawing: 0,
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
        u_rad: settings.radius
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

    const data = randomData(settings.W * settings.H * 4);
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

    rescale();
    for (let i=0; i<settings.initSteps; i++) {
      _step();
    }
    step();
    addListeners();
    return this;
  };

  const addListeners = function() {
    el.addEventListener('touchend', (e) => {
      if (props.drawing){
        setDrawing(0);
      } else if (props.stopped) {
        start();
      } else {
        stop();
      }}, null);
    el.addEventListener('touchmove', (e) => {
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches.item(0);
        setCursor(t.clientX, t.clientY), setDrawing(1);
      }
    }, null);
    el.addEventListener('mousemove', (e) => {
      props.drawing && setCursor(e.clientX, e.clientY); }, null);
    el.addEventListener('mousedown', (e) => {
      setCursor(e.clientX, e.clientY), setDrawing(1); }, null);
    el.addEventListener('mouseup', (e) => {
      setCursor(e.clientX, e.clientY), setDrawing(0); }, null);
    el.addEventListener('mouseout', (e) => {
      setDrawing(0); stop(); }, null);
    el.addEventListener('mouseover', (e) => {
      start(); }, null);
    window.addEventListener('resize', (e) => {
      rescale();
      render(); }, null);
  };


  const _step = function() {
    const i = props.cycles % 2;
    stepProgram.use();
    stepProgram.setTexture(textures[i]);
    stepProgram.setFramebuffer(framebuffers[1-i], settings.W, settings.H);
    stepProgram.draw();
    props.cycles++;
  };

  const render = function() {
    const i = props.cycles % 2;
    renderProgram.use();
    renderProgram.setTexture(textures[i]);
    renderProgram.setFramebuffer(renderFrame, canvas.width, canvas.height);
    renderProgram.draw();
    transformProgram.use();
    transformProgram.setTexture(renderTex);
    transformProgram.setFramebuffer(null, canvas.width, canvas.height);
    transformProgram.draw();
  };

  const step = function() {
    _step();
    render();
  };

  const main = function(t) {
    if (props.stopped) return;
    step();
    if (settings.framerate) {
      let wait = 1000/settings.framerate - (t - props.lastTimestamp);
      props.lastTimestamp = t;
      if (wait > 0) {
        window.setTimeout(main, wait);
        return;
      }
    }
    props.animation = requestAnimationFrame(main);
  };

  const start = function() {
    if (props.stopped) {
      props.stopped = false;
      props.animation = requestAnimationFrame(main);
    }
  };

  const stop = function() {
    if (props.animation)
      cancelAnimationFrame(props.animation);
    props.stopped = true;
  };

  const setCursor = function(x, y) {
    stepProgram.setUniform('u_cursor', client2grid(x, y));
    _step();
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
    renderProgram.setUniform('u_rad', r);
    renderProgram.setUniform('u_center', [r, r]);
    renderProgram.updateTexture(renderTex, null, {width: 2*r, height:2*r});
    transformProgram.setAttribute('a_position', rectArray(-r, -r, 2*r, 2*r));
  };

  const rescale = function() {
    const x = canvas.clientWidth;
    const y = canvas.clientHeight;
    const t = el.offsetTop;
    const l = el.offsetLeft;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    props.transform = new mat3();
    props.transform.rotate(Math.PI/4).translate(l+w/2, t+h/2).normalize(x, y, true);

    canvas.width = x;
    canvas.height = y;

    transformProgram.setUniform('u_transform', props.transform.values());
    setRenderRadius(h/2);
  };

  const targetRelative = function(x, y) {
    return [-el.offsetLeft + x, -el.offsetTop + y];
  };

  const client2grid = function(x, y, cellsize) {
    /*
      the computational texture is in cartesian space with
      0,0 at the center of the canvas.

      to get cell coordinates from client coordinates,
      subtract center, divide by cell size, and reverse rotation.
    */
    [x, y] = targetRelative(x, y);
    cellsize = cellsize || settings.cellsize;
    const t = new mat3().translate(-el.clientWidth/2, -el.clientHeight/2)
          .scale(1/cellsize)
          .rotate(-Math.PI/4);
    const xy = t.project(x + cellsize/2, y + cellsize/2);
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

  const randomData = function(size) {
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
varying vec2 v_texCoord;

void main() {
  vec2 pos = gl_FragCoord.xy - u_center;

  // clip to grid inside circle
  vec2 grid_pos = floor(pos / u_cellsize + .5);
  float rad = floor(u_rad / u_cellsize);

  if (dot(grid_pos, grid_pos) < rad*rad) {
    if (u_cellsize > 2. && (
      mod(pos.x + u_cellsize/2., u_cellsize) < 1. ||
      mod(pos.y + u_cellsize/2., u_cellsize) < 1.)) {
      gl_FragColor = vec4(1,1,1,1);
    } else {
      vec4 val = texture2D(u_image, (grid_pos+.5) / u_texsize);
      if (val.x > 0.) {
        gl_FragColor = vec4(.2, cos(val.x), sin(val.x*1.5),1) * val.x +
                       vec4(.95, .95, .98, 1) * (1.-val.x);
      } else {
        gl_FragColor = vec4(.95, .95, .98, 1);
      }
    }
  } else {
    gl_FragColor = vec4(1,1,1,0);
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

  if (u_drawing > 0) {
    vec2 dpos = pos * u_texsize - mod(u_cursor, u_texsize);
    if (abs(dpos.x) < .5 && abs(dpos.y) < .5) {
      gl_FragColor = vec4(1, 1, 0, 1);
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
    setCellsize: setCellsize,
    setDrawing: setDrawing,
    setCursor: setCursor,
    gl: () => {return(gl);},
    m3: mat3
  };
})(document, window).init();
