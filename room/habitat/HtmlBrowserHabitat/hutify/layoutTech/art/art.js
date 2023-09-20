global.rooms['habitat.HtmlBrowserHabitat.hutify.layoutTech.art'] = async () => {
  
  let makePathFns = ctx => ({
    jump: (x, y) => ctx.moveTo(x, -y),
    draw: (x, y) => ctx.lineTo(x, -y),
    curve: (x, y, cx1, cy1, cx2, cy2) => ctx.bezierCurveTo(cx1, -cy1, cx2, -cy2, x, y),
    arc: (x1, y1, x2, y2, x3, y3, clockwise=true) => {
      
      // Connects (x1,y1) to (x3,y3) via an arc centered at (x2,y2)
      // TODO: (x1,y1) should default to most recent turtle-graphics
      // point
      
      y1 *= -1; y2 *= -1; y3 *= -1;
      
      let dx = (x2 - x1);
      let dy = (y2 - y1);
      let r = Math.sqrt(dx * dx + dy * dy);
      let ang1 = Math.atan2(y1 - y2, x1 - x2);
      let ang2 = Math.atan2(y3 - y2, x3 - x2);
      ctx.arc(x2, y2, r, ang1, ang2, !clockwise);
      
    }
  });
  let makeDraw = ctx => ({
    
    getDims: () => {
      let { width: w, height: h } = canvas.getBoundingClientRect();
      return {
        pxW: canvas.width, pxH: canvas.height,
        w, h, hw: w >> 1, hh: h >> 1 // TODO: Should these be included? Shouldn't client be purely concerned with pixel dimensions? (As opposed to dom dimensions?)
      };
    },
    imgCache: {},
    
    defStyle: {
      fillStyle: null,
      strokeStyle: null,
      lineWidth: 1,
      globalCompositeOperation: 'source-over'
    },
    initFrameCen: (style, f) => {
      draw.frame(() => {
        draw.trn(canvas.width >> 1, -(canvas.height >> 1));
        if (style) {
          if (isForm(style, String)) style = { fillStyle: style };
          draw.rectCen(0, 0, canvas.width, canvas.height, style);
        }
        draw.scl(this.pixelDensityMult);
        f();
      });
    },
    frame: f => { ctx.save(); f(); ctx.restore(); },
    rot: ang => ctx.rotate(ang),
    trn: (x, y) => ctx.translate(x, -y),
    scl: (x, y=x) => ctx.scale(x, y),
    rect: (x, y, w, h, style) => {
      style = { ...draw.defStyle, ...style  };
      for (let k in style) ctx[k] = style[k];
      if (style.fillStyle) ctx.fillRect(x, -(y + h), w, h);
      if (style.strokeStyle) ctx.strokeRect(x, -(y + h), w, h);
    },
    rectCen: (x, y, w, h, style) => {
      draw.rect(x - w * 0.5, y - h * 0.5, w, h, style);
    },
    circ: (x, y, r, style) => {
      ctx.beginPath();
      if (r >= 0) ctx.arc(x, -y, r, Math.PI * 2, 0);
      else        ctx.arc(x, -y, -r, -Math.PI * 2, 0);
      
      style = { ...draw.defStyle, ...style  };
      for (let k in style) ctx[k] = style[k];
      if (style.fillStyle) ctx.fill();
      if (style.strokeStyle) ctx.stroke();
    },
    image: (keep, x, y, w, h, alpha=1) => {
      let hw = w >> 1;
      let hh = h >> 1;
      
      let url = global.uri(keep.getUrlParams(), { fixed: true });
      let img = !draw.imgCache.has(url)
        ? draw.imgCache[url] = Object.assign(new Image(), { src: url })
        : draw.imgCache[url];
      
      try {
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, -(y + h), w, h);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
      } catch (err) {
        /// {DEBUG=
        gsc('Error drawing image', err);
        /// =DEBUG}
      }
    },
    imageCen: (keep, x, y, w, h=w, alpha=1) => {
      draw.image(keep, x - (w >> 1), y - (h >> 1), w, h, alpha);
    },
    path: (style, f) => {
      ctx.beginPath(); f(pathFns); ctx.closePath();
      
      style = { ...draw.defStyle, ...style  };
      for (let k in style) ctx[k] = style[k];
      if (style.fillStyle) ctx.fill();
      if (style.strokeStyle) ctx.stroke();
    },
    poly: (style, pts) => {
      draw.path(style, fns => {
        let [ pt0, ...morePts ] = pts;
        fns.jump(pt0.x, pt0.y);
        for (let pt of morePts) fns.draw(pt.x, pt.y);
      });
    }
    
  });
  
  return {
    install: (real, layout, cleanupTmp) => {
      
      let artKeySrc = layout.getParam(real, 'artKeySrc');
      let keys = Set();
      artKeySrc.mod(keys);
      
      let canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'absolute',
        width: '100%', height: '100%',
        left: '0', top: '0',
        imageRendering: 'pixelated'
      });
      canvas.setAttribute('tabIndex', '0');
      
      real.node.appendChild(canvas);
      cleanupTmp.endWith(() => canvas.remove());
      
      cleanupTmp.endWith(canvas.evt('keydown', evt => {
        keys.has(evt.keyCode) || (keys.add(evt.keyCode), keySrc.send(keys));
        preventDef(evt);
      }));
      cleanupTmp.endWith(canvas.evt('keyup', evt => {
        keys.has(evt.keyCode) && (keys.rem(evt.keyCode), keySrc.send(keys));
        preventDef(evt);
      }));
      cleanupTmp.endWith(canvas.evt('blur', evt => {
        if (keys.empty()) return;
        keys.clear();
        keySrc.send(keys);
      }));
      
      let pathFns = makePathFns(ctx);
      let draw = makeDraw(ctx);
      
      (async () => {
        
        while (cleanupTmp.onn()) {
          
          await Promise(r => requestAnimationFrame(r));
          
          let pixelCount = layout.getParam(real, 'pixelCount');
          let pixelMult = layout.getParam(real, 'pixelDensityMult');
          let animationFn = layout.getParam(real, 'animationFn');
          
          let { width: canW, height: canH } = real.node.getBoundingClientRect();
          let { w: pxW, h: pxH } = pixelCount ?? { w: canW, h: canH }.map(v => Math.ceil(v * pixelMult));
          
          // Resize canvas if necessary
          if (pxW !== canvas.width || pxH !== canvas.height) [ canvas.width, canvas.height ] = [ pxW, pxH ];
          
          animationFn?.(draw);
          
        }
        
      })();
      
    },
    render: (real, layout) => {
      
      
    }
  };
  
};
