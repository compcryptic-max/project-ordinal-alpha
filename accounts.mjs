import {randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function createAccountService(pool){
 const accounts=new Map();
 if(pool)await pool.query('create table if not exists ordinal_accounts (login text primary key, payload jsonb not null)');
 const read=async login=>pool?(await pool.query('select payload from ordinal_accounts where login=$1',[login])).rows[0]?.payload:accounts.get(login);
 const write=async a=>{if(pool)await pool.query('insert into ordinal_accounts(login,payload) values($1,$2) on conflict(login) do update set payload=excluded.payload',[a.login,a]);else accounts.set(a.login,a)};
 const passwordHash=async (password,salt)=>Buffer.from(await scrypt(password,salt,64)).toString('hex');
 const view=a=>({login:a.login,displayName:a.displayName,playerKey:a.playerKey,verificationRequired:false,persistent:!!pool});
 return async(action,input={})=>{
  // Alpha accepts invented identifiers, names and passwords; no email/domain/identity checks.
  const login=String(input.login||'').trim().toLowerCase().slice(0,160),password=String(input.password||'').slice(0,1024);
  if(!login)throw Error('Enter an account name or test email.');
  if(action==='signup'){
   if(!password)throw Error('Enter a test password.');
   if(await read(login))throw Error('That test account already exists. Sign in or choose another account name.');
   const salt=randomBytes(16).toString('hex'),recoveryCode=randomBytes(18).toString('hex').toUpperCase();
   const a={login,displayName:String(input.displayName||'Wayfarer').slice(0,60),playerKey:randomUUID(),salt,passwordHash:await passwordHash(password,salt),recoveryHash:digest(recoveryCode)};
   await write(a);return {...view(a),recoveryCode};
  }
  const a=await read(login);
  if(action==='signin'){
   if(!a||!password)throw Error('Account name or password was not accepted.');
   const actual=Buffer.from(await passwordHash(password,a.salt),'hex'),expected=Buffer.from(a.passwordHash,'hex');
   if(!timingSafeEqual(actual,expected))throw Error('Account name or password was not accepted.');
   return view(a);
  }
  if(action==='recover'){
   const code=String(input.recoveryCode||'').replace(/\s|-/g,'').toUpperCase();
   if(!a||!code||digest(code)!==a.recoveryHash)throw Error('Account recovery code was not accepted.');
   if(!password)throw Error('Enter a new test password.');
   const recoveryCode=randomBytes(18).toString('hex').toUpperCase();a.salt=randomBytes(16).toString('hex');a.passwordHash=await passwordHash(password,a.salt);a.recoveryHash=digest(recoveryCode);await write(a);
   return {...view(a),recoveryCode};
  }
  throw Error('Unknown account action.');
 };
}
