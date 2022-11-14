global.rooms['internal.help'] = foundation => ({ open: async () => {
  console.log(`Showing help:`);
  let { settle, ...origArgs } = foundation.origArgs;
  let computedArgs = await Promise.all(origArgs.map((v, k) => foundation.conf(k)));
  console.log(`Arguments supplied:`, origArgs);
  console.log(`These resolved to:`, computedArgs);
}});
