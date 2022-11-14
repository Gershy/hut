global.rooms['Pt2d'] = foundation => U.form({ name: 'Pt2d', props: (forms, Form) => ({
  
  $pi: Math.PI,
  $pi2: Math.PI * 2,
  $normAng: ang => {
    ang = ang % Form.pi2;
    if      (ang <= -Form.pi) ang += Form.pi2;
    else if (ang >= +Form.pi) ang -= Form.pi2;
    return ang;
  },
  
  init: function({ x=null, y=null, r=null, d=null }) {
    Object.assign(this, { x, y, r, d });
  },
  getMag: function() {
    if (this.d === null) this.d = Math.sqrt(this.x * this.x + this.y * this.y);
    return this.d;
  },
  getRot: function() {
    if (this.r === null) this.r = Math.atan2(this.x, this.y);
    return this.r;
  },
  getCarte: function() {
    if (this.x === null) {
      this.x = Math.sin(this.r) * this.d;
      this.y = Math.cos(this.r) * this.d;
    }
    return this;
  },
  getPolar: function() {
    if (this.r === null) this.r = Math.atan2(this.x, this.y);
    if (this.d === null) this.d = Math.sqrt(this.x * this.x + this.y * this.y);
    return this;
  },
  scaled: function(amt) {
    return (0, this.Form)({
      x: this.x && this.x * amt,
      y: this.y && this.y * amt,
      d: this.d && this.d * amt,
      r: this.r
    });
  },
  rotated: function(amt) {
    this.getPolar();
    return (0, this.Form)({ r: Form.normAng(this.r + amt), d: this.d });
  }
  
})});
