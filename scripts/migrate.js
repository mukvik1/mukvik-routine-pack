'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for commerce migration');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query(fs.readFileSync(path.join(__dirname,'..','db','001_commerce.sql'),'utf8'));
  await client.query('COMMIT');
  process.stdout.write('Commerce schema ready.\n');
 }catch(error){
  await client.query('ROLLBACK');
  throw error;
 }finally{
  client.release();
  await pool.end();
 }
}
main().catch(error=>{console.error('Commerce migration failed:',error.code||error.name||'error');process.exitCode=1;});
