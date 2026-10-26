const crypto=require('node:crypto');
function resolveDataKey(env=process.env){
 if(env.ORDER_DATA_KEY){const key=Buffer.from(env.ORDER_DATA_KEY,'base64');if(key.length!==32)throw new Error('ORDER_DATA_KEY must encode 32 bytes.');return env.ORDER_DATA_KEY;}
 if(env.ORDER_DATA_SECRET){if(env.ORDER_DATA_SECRET.length<32)throw new Error('ORDER_DATA_SECRET must contain at least 32 random characters.');return crypto.scryptSync(env.ORDER_DATA_SECRET,'sajumoon-order-key-v1',32).toString('base64');}
 return undefined;
}
module.exports={resolveDataKey};
