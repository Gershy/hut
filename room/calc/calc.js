global.rooms['calc'] = foundation => {
  
  let pi = Math.PI;
  let pi2 = Math.PI * 2;
  
  let calc = {
    angleBetweenPoints: (pt1, pt2) => Math.atan2(pt2.x - pt1.x, pt2.y - pt1.y),
    normalizeAngle: (ang) => {
      if (ang >= -pi && ang <= +pi) return ang;
      while (ang < -pi) ang += pi2;
      while (ang > +pi) ang -= pi2;
      return ang;
    },
    angleDifference: (ang1, ang2) => {
      return calc.normalizeAngle(ang2 - ang1);
    }
  };
  
  return calc;
  
};
