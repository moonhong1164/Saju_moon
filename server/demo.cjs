if(process.env.NODE_ENV==='production')throw new Error('Local demo cannot run in production.');
process.env.DEMO_MODE='1';
require('./start.cjs');
