'use strict';
const WELCOME_START='2026-10-20T07:39:39.000Z';
const WELCOME_PACK_CENTS=3920;
const WELCOME_DISCOUNT_PERCENT=20;
async function welcomeEligible(db,customerId){
 const result=await db.query(`SELECT (c.created_at >= $2::timestamptz AND NOT EXISTS (
  SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id
  WHERE o.customer_id=c.id AND i.product_code='pack' AND o.status<>'cancelled'
 )) AS welcome_eligible FROM customers c WHERE c.id=$1`,[customerId,WELCOME_START]);
 return result.rows[0]?.welcome_eligible===true;
}
const BLACK_FRIDAY_START=Date.parse('2026-11-26T22:00:00Z');
const BLACK_FRIDAY_END=Date.parse('2026-11-30T22:00:00Z');
function packPromotion(now=Date.now()){
 return now>=BLACK_FRIDAY_START&&now<BLACK_FRIDAY_END?{productCode:'pack',priceCents:2999,label:'Black Friday Special'}:null;
}
function priceProducts(products,eligible,now=Date.now()){
 const promotion=packPromotion(now);
 if(promotion)return products.map(p=>p.code==='pack'?{...p,cents:promotion.priceCents,originalCents:p.cents}:{...p});
 return products.map(p=>p.code==='pack'&&eligible?{...p,cents:WELCOME_PACK_CENTS,originalCents:p.cents,discountPercent:WELCOME_DISCOUNT_PERCENT}:{...p});
}
module.exports={WELCOME_START,WELCOME_PACK_CENTS,WELCOME_DISCOUNT_PERCENT,welcomeEligible,priceProducts,packPromotion};
