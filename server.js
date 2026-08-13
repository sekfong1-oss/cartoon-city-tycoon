"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 12000,
  pingTimeout: 25000
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "rooms.json");

app.use(express.static(path.join(__dirname, "public")));

const boardData = [
  {type:"start",name:"City Gate",icon:"🚩",text:"Pass +200"},
  {type:"property",name:"Bubble Café",icon:"🧋",price:140,rent:24,color:"#ff8fab",district:"Neon"},
  {type:"chance",name:"Lucky Card",icon:"🎁"},
  {type:"property",name:"Pixel Arcade",icon:"🕹️",price:160,rent:28,color:"#ffb347",district:"Neon"},
  {type:"tax",name:"City Tax",icon:"🧾",amount:90},
  {type:"property",name:"Panda Park",icon:"🐼",price:180,rent:32,color:"#8ed1a4",district:"Happy"},
  {type:"festival",name:"Festival",icon:"🎪",amount:80},
  {type:"property",name:"Rainbow Mall",icon:"🌈",price:220,rent:40,color:"#7dc8ff",district:"Happy"},
  {type:"chance",name:"Mystery Box",icon:"❓"},
  {type:"property",name:"Rocket Station",icon:"🚀",price:240,rent:45,color:"#9f8cff",district:"Star"},
  {type:"jail",name:"Detention",icon:"🚧"},
  {type:"property",name:"Kitty Hotel",icon:"🐱",price:260,rent:50,color:"#ff8bd1",district:"Star"},
  {type:"tax",name:"Repair Bill",icon:"🛠️",amount:120},
  {type:"property",name:"Cloud Cinema",icon:"🎬",price:280,rent:56,color:"#80d8ff",district:"Sky"},
  {type:"rest",name:"Chill Zone",icon:"🌴"},
  {type:"property",name:"Dragon Tower",icon:"🐲",price:310,rent:65,color:"#ff7a68",district:"Sky"},
  {type:"chance",name:"Lucky Card",icon:"🎲"},
  {type:"property",name:"Moon Market",icon:"🌙",price:340,rent:72,color:"#7b8cff",district:"Moon"},
  {type:"festival",name:"Street Show",icon:"🎤",amount:100},
  {type:"property",name:"Candy Castle",icon:"🍭",price:370,rent:82,color:"#ff80b7",district:"Moon"},
  {type:"tax",name:"Luxury Fee",icon:"💸",amount:150},
  {type:"property",name:"Galaxy Plaza",icon:"🌌",price:410,rent:94,color:"#7766ee",district:"Prestige"},
  {type:"chance",name:"Mega Event",icon:"✨"},
  {type:"property",name:"Golden Harbor",icon:"⚓",price:450,rent:108,color:"#f6b93b",district:"Prestige"}
];

const characters = {
  tiger:  {emoji:"🐯", name:"Tiger Investor", ability:"10% cheaper property purchases"},
  rabbit: {emoji:"🐰", name:"Rabbit Runner", ability:"+50 bonus every time you pass City Gate"},
  panda:  {emoji:"🐼", name:"Panda Saver", ability:"25% less city tax and fees"},
  fox:    {emoji:"🦊", name:"Fox Negotiator", ability:"10% less rent paid"},
  frog:   {emoji:"🐸", name:"Lucky Frog", ability:"Better rewards and smaller Lucky Card penalties"},
  bear:   {emoji:"🐻", name:"Bear Builder", ability:"15% cheaper property upgrades"}
};

const marketEvents = [
  {id:"normal",name:"Normal Week",icon:"🌤️",rentMult:1,buyMult:1,upgradeMult:1,taxMult:1,festivalMult:1},
  {id:"boom",name:"City Boom",icon:"📈",rentMult:1.25,buyMult:1,upgradeMult:1,taxMult:1,festivalMult:1},
  {id:"buyers",name:"Buyer Market",icon:"🏷️",rentMult:1,buyMult:.85,upgradeMult:1,taxMult:1,festivalMult:1},
  {id:"build",name:"Construction Week",icon:"🏗️",rentMult:1,buyMult:1,upgradeMult:.75,taxMult:1,festivalMult:1},
  {id:"tourism",name:"Tourist Season",icon:"🧳",rentMult:1.1,buyMult:1,upgradeMult:1,taxMult:1,festivalMult:1.5},
  {id:"taxholiday",name:"Tax Holiday",icon:"🎊",rentMult:1,buyMult:1,upgradeMult:1,taxMult:.5,festivalMult:1}
];

const missions = [
  {id:"landlord",name:"Mini Landlord",text:"Own 3 properties",reward:250},
  {id:"builder",name:"City Builder",text:"Reach 3 total upgrade levels",reward:300},
  {id:"traveler",name:"World Traveler",text:"Complete 2 laps",reward:220},
  {id:"rich",name:"Cash King",text:"Hold 2,300 cash",reward:220},
  {id:"district",name:"District Boss",text:"Own a full 2-property district",reward:350}
];

const rooms = new Map();
const auctionTimers = new Map();
const disconnectTimers = new Map();
const miniGameTimers = new Map();
let persistTimer = null;

function safeText(v, max = 32) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i=0;i<5;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}
function chooseMission() {
  return missions[Math.floor(Math.random()*missions.length)];
}
function chooseMarket() {
  return marketEvents[Math.floor(Math.random()*marketEvents.length)];
}
function characterKey(v) {
  return characters[v] ? v : "tiger";
}
function safeAvatar(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length > 250000) return "";
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(s) ? s : "";
}
function frameKey(v) {
  const x = String(v || "").trim().toLowerCase();
  return ["common","rare","epic","legendary","mythic"].includes(x) ? x : "rare";
}
function skinModeKey(v) {
  const x = String(v || "").trim().toLowerCase();
  return ["character","cyber","royal","sport"].includes(x) ? x : "character";
}
function currentPlayer(room) {
  return room.state ? room.state.players[room.state.current] : null;
}
function activePlayers(room) {
  return room.state.players.filter(p => !p.bankrupt);
}
function roomPlayerBySocket(room, socket) {
  return room.players.find(p => p.socketId === socket.id);
}
function roomPlayerById(room, id) {
  return room.players.find(p => p.id === id);
}
function actorIsCurrent(room, socket) {
  const rp = roomPlayerBySocket(room, socket);
  const cp = currentPlayer(room);
  return !!(rp && cp && rp.id === cp.id && !cp.bankrupt);
}
function districtIndexes(district) {
  return boardData.map((t,i)=>t.type==="property" && t.district===district ? i : -1).filter(i=>i>=0);
}
function ownsDistrict(room, playerId, district) {
  const ids = districtIndexes(district);
  return ids.length > 0 && ids.every(idx => room.state.owners[idx] === playerId);
}
function totalUpgradeLevels(room, p) {
  return p.properties.reduce((sum,idx)=>sum+(room.state.levels[idx]||0),0);
}
function netWorth(room, p) {
  let total = p.cash;
  p.properties.forEach(idx => {
    total += boardData[idx].price;
    total += Math.round(boardData[idx].price * .55 * (room.state.levels[idx] || 0));
  });
  return Math.round(total);
}
function addLog(room, text) {
  room.log.unshift({id:crypto.randomUUID(),ts:Date.now(),text:safeText(text,320)});
  room.log = room.log.slice(0,50);
}
function addChat(room, player, text) {
  const msg = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    playerId: player.id,
    name: player.name,
    character: player.character,
    text: safeText(text,240)
  };
  room.chat.push(msg);
  room.chat = room.chat.slice(-80);
  return msg;
}
function rtcConfig() {
  const iceServers = [
    {urls:"stun:stun.l.google.com:19302"},
    {urls:"stun:stun.cloudflare.com:3478"}
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || ""
    });
  }
  return {iceServers};
}

function createRoom(socket, name, character, avatar, frame, skinMode) {
  let code;
  do code = makeCode(); while (rooms.has(code));
  const token = makeToken();
  const room = {
    code,
    hostPlayerId:0,
    phase:"lobby",
    settings:{maxRounds:20,startingCash:1600,auctionSeconds:18,maxPlayers:12,miniGameEvery:3},
    players:[{
      id:0,
      name:safeText(name,16)||"Player 1",
      character:characterKey(character),
      avatar:safeAvatar(avatar),
      frame:frameKey(frame),
      skinMode:skinModeKey(skinMode),
      sessionToken:token,
      socketId:socket.id,
      connected:true,
      voice:false,
      lastSeen:Date.now()
    }],
    state:null,
    log:[],
    chat:[],
    createdAt:Date.now(),
    updatedAt:Date.now()
  };
  rooms.set(code,room);
  socket.join(code);
  socket.data.roomCode=code;
  socket.data.playerId=0;
  addLog(room,`🎉 ${room.players[0].name} created room ${code}.`);
  persistSoon();
  return {room,token};
}

function addPlayer(room, socket, name, character, avatar, frame, skinMode) {
  if (room.phase !== "lobby") throw new Error("Game already started");
  if (room.players.length >= (room.settings?.maxPlayers || 12)) throw new Error("Room is full");
  const id = room.players.length;
  const token = makeToken();
  const p = {
    id,
    name:safeText(name,16)||`Player ${id+1}`,
    character:characterKey(character),
    avatar:safeAvatar(avatar),
    frame:frameKey(frame),
    skinMode:skinModeKey(skinMode),
    sessionToken:token,
    socketId:socket.id,
    connected:true,
    voice:false,
    lastSeen:Date.now()
  };
  room.players.push(p);
  socket.join(room.code);
  socket.data.roomCode=room.code;
  socket.data.playerId=id;
  addLog(room,`👋 ${p.name} joined the room.`);
  persistSoon();
  return {player:p,token};
}

function reconnectPlayer(room, socket, token) {
  const p = room.players.find(x => x.sessionToken === token);
  if (!p) throw new Error("Reconnect session not found");
  if (p.socketId && p.socketId !== socket.id) {
    const old = io.sockets.sockets.get(p.socketId);
    if (old) old.disconnect(true);
  }
  p.socketId=socket.id;
  p.connected=true;
  p.voice=false;
  p.lastSeen=Date.now();
  socket.join(room.code);
  socket.data.roomCode=room.code;
  socket.data.playerId=p.id;
  if (room.state?.players?.[p.id]) room.state.players[p.id].connected=true;
  cancelDisconnectSkip(room.code,p.id);
  addLog(room,`🔄 ${p.name} reconnected.`);
  persistSoon();
  return p;
}

function publicPlayer(p, hostPlayerId) {
  return {
    id:p.id,
    name:p.name,
    character:p.character,
    avatar:p.avatar || "",
    frame:p.frame || "rare",
    skinMode:p.skinMode || "character",
    connected:p.connected,
    voice:p.voice,
    isHost:p.id===hostPlayerId
  };
}
function roomView(room) {
  return {
    code:room.code,
    hostPlayerId:room.hostPlayerId,
    phase:room.phase,
    settings:room.settings,
    players:room.players.map(p=>publicPlayer(p,room.hostPlayerId)),
    state:room.state,
    log:room.log,
    chat:room.chat
  };
}
function emitRoom(room) {
  room.updatedAt=Date.now();
  io.to(room.code).emit("room:update",roomView(room));
  persistSoon();
}

function initialGamePlayer(rp, cash) {
  return {
    id:rp.id,
    name:rp.name,
    character:rp.character,
    avatar:rp.avatar || "",
    frame:rp.frame || "rare",
    skinMode:rp.skinMode || "character",
    connected:rp.connected,
    cash,
    pos:0,
    properties:[],
    skip:0,
    bankrupt:false,
    laps:0,
    mission:{...chooseMission(),done:false},
    cards:{shield:0,turbo:0,rentBoost:0,taxPass:0},
    buffs:{turbo:false,rentBoost:false},
    doublesStreak:0
  };
}
function startState(room) {
  return {
    current:0,
    round:1,
    maxRounds:room.settings.maxRounds,
    owners:Array(boardData.length).fill(null),
    levels:Array(boardData.length).fill(0),
    lastRoll:null,
    turnStage:"roll",
    pendingBuy:null,
    pendingRisk:null,
    auction:null,
    miniGame:null,
    extraRoll:false,
    jackpot:300,
    chaosEvent:null,
    market:chooseMarket(),
    players:room.players.map(rp=>initialGamePlayer(rp,room.settings.startingCash)),
    finished:false,
    winnerIds:[]
  };
}
function market(room) {
  return room.state.market || marketEvents[0];
}
function buyPrice(room,p,idx) {
  let x=boardData[idx].price * market(room).buyMult;
  if (p.character==="tiger") x*=.9;
  return Math.max(1,Math.round(x));
}
function upgradeCost(room,p,idx) {
  let x=boardData[idx].price*.55*market(room).upgradeMult;
  if (p.character==="bear") x*=.85;
  return Math.max(1,Math.round(x));
}
function rentFor(room,idx) {
  const t=boardData[idx];
  const lvl=room.state.levels[idx]||0;
  let x=t.rent * [1,1.75,2.75,4][lvl];
  const owner=room.state.owners[idx];
  if (owner!==null && ownsDistrict(room,owner,t.district)) x*=1.5;
  x*=market(room).rentMult;
  return Math.max(1,Math.round(x));
}
function gateReward(p) {
  return p.character==="rabbit" ? 250 : 200;
}
function movePlayer(room,p,steps) {
  for(let s=0;s<steps;s++){
    p.pos=(p.pos+1)%boardData.length;
    if(p.pos===0){
      const reward=gateReward(p);
      p.cash+=reward;
      p.laps++;
      addLog(room,`🚩 ${p.name} passed City Gate and collected ${reward}.`);
    }
  }
}
function effectiveTax(room,p,amount) {
  let x=amount*market(room).taxMult;
  if(p.character==="panda") x*=.75;
  if(p.character==="frog") x*=.85;
  return Math.max(0,Math.round(x));
}
function payBank(room,p,amount,reason,toJackpot=false) {
  if(p.cards.taxPass>0){
    p.cards.taxPass--;
    addLog(room,`🧿 ${p.name}'s Tax Pass blocked ${reason}.`);
    return 0;
  }
  const due=effectiveTax(room,p,amount);
  const before=Math.max(0,p.cash);
  p.cash-=due;
  const actual=Math.min(before,due);
  if(toJackpot && room.state) room.state.jackpot=(room.state.jackpot||0)+actual;
  addLog(room,`🧾 ${p.name} paid ${due} for ${reason}${toJackpot?` • Jackpot +${actual}`:""}.`);
  return due;
}
function transferRent(room,from,to,amount,reason) {
  let due=amount;
  if(from.character==="fox") due=Math.round(due*.9);
  if(from.cards.shield>0){
    from.cards.shield--;
    due=Math.round(due*.5);
    addLog(room,`🛡️ ${from.name} used a Shield and cut the rent in half.`);
  }
  if(to.buffs.rentBoost){
    to.buffs.rentBoost=false;
    due*=2;
    addLog(room,`🔥 ${to.name}'s Double Rent power activated!`);
  }
  const available=Math.max(0,from.cash);
  const paid=Math.min(available,due);
  from.cash-=due;
  to.cash+=paid;
  addLog(room,`💸 ${from.name} paid ${paid} to ${to.name} for ${reason}.`);
  return paid;
}

function grantCard(room,p,type,count=1) {
  if(!(type in p.cards)) return;
  p.cards[type]+=count;
  const names={shield:"Shield",turbo:"Turbo +3",rentBoost:"Double Rent",taxPass:"Tax Pass"};
  addLog(room,`🃏 ${p.name} received ${names[type]}!`);
}
function chanceEvent(room,p) {
  const positive = (amount) => p.character==="frog" ? Math.round(amount*1.2) : amount;
  const penalty = (amount) => p.character==="frog" ? Math.round(amount*.85) : amount;
  const events=[
    () => {const x=positive(180);p.cash+=x;return `🎬 Viral Cartoon! Collect ${x}.`;},
    () => {const x=penalty(100);payBank(room,p,x,"taxi trouble");return `🚕 Taxi Trouble: pay a city fee.`;},
    () => {const x=positive(140);p.cash+=x;return `🎁 Surprise Gift: collect ${x}.`;},
    () => {const x=penalty(45*p.properties.length);payBank(room,p,x,"property repairs");return `🏗️ Repair Day affects your properties.`;},
    () => {p.pos=10;p.skip=1;if(room.state)room.state.extraRoll=false;return "🚧 Go to Detention and skip your next turn.";},
    () => {p.pos=0;const x=gateReward(p);p.cash+=x;p.laps++;return `🚩 Express Bus to City Gate. Collect ${x}.`;},
    () => {const x=positive(75);p.cash+=x;return `🎪 Street Performance: collect ${x}.`;},
    () => {const x=penalty(85);payBank(room,p,x,"snack shopping");return "💸 Shopping Spree: pay for snacks.";},
    () => {const x=positive(35*p.properties.length);p.cash+=x;return `✨ Property Bonus: collect ${x}.`;},
    () => {movePlayer(room,p,3);return "🛴 Shortcut: move forward 3 spaces.";},
    () => {grantCard(room,p,"shield");return "🛡️ Found a Shield card.";},
    () => {grantCard(room,p,"turbo");return "⚡ Found a Turbo +3 card.";},
    () => {grantCard(room,p,"rentBoost");return "🔥 Found a Double Rent card.";},
    () => {grantCard(room,p,"taxPass");return "🧿 Found a Tax Pass card.";}
  ];
  return events[Math.floor(Math.random()*events.length)]();
}
function missionComplete(room,p) {
  const m=p.mission;
  if(!m || m.done) return false;
  if(m.id==="landlord") return p.properties.length>=3;
  if(m.id==="builder") return totalUpgradeLevels(room,p)>=3;
  if(m.id==="traveler") return p.laps>=2;
  if(m.id==="rich") return p.cash>=2300;
  if(m.id==="district") return [...new Set(p.properties.map(i=>boardData[i].district))].some(d=>ownsDistrict(room,p.id,d));
  return false;
}
function checkMissions(room) {
  room.state.players.forEach(p=>{
    if(p.bankrupt || !p.mission || p.mission.done) return;
    if(missionComplete(room,p)){
      p.mission.done=true;
      p.cash+=p.mission.reward;
      addLog(room,`🎯 ${p.name} completed "${p.mission.name}" and earned ${p.mission.reward}!`);
    }
  });
}

function maybeStreetDuel(room,p) {
  if(!room.state || room.state.finished || p.bankrupt) return;
  const opponents=room.state.players.filter(x=>!x.bankrupt && x.id!==p.id && x.pos===p.pos);
  if(!opponents.length) return;
  if(Math.random()>.55) return; // not every shared tile becomes a duel

  const opp=opponents[Math.floor(Math.random()*opponents.length)];
  let a=1+Math.floor(Math.random()*6), b=1+Math.floor(Math.random()*6), tries=0;
  while(a===b && tries<3){
    a=1+Math.floor(Math.random()*6);
    b=1+Math.floor(Math.random()*6);
    tries++;
  }
  if(a===b){
    addLog(room,`⚔️ Street Duel! ${p.name} and ${opp.name} tied ${a}-${b}. Nobody wins.`);
    return;
  }
  const winner=a>b?p:opp;
  const reward=120;
  winner.cash+=reward;
  addLog(room,`⚔️ Street Duel! ${p.name} rolled ${a}, ${opp.name} rolled ${b}. ${winner.name} wins ${reward}!`);
}

function runChaosEvent(room) {
  if(!room.state || room.state.finished) return;
  const active=room.state.players.filter(p=>!p.bankrupt);
  const events=[
    {
      icon:"💰",name:"City Stimulus",text:"Every active player receives 120.",
      run:()=>active.forEach(p=>p.cash+=120)
    },
    {
      icon:"🎁",name:"Power Card Drop",text:"Every active player receives a random power card.",
      run:()=>{
        const types=["shield","turbo","rentBoost","taxPass"];
        active.forEach(p=>grantCard(room,p,types[Math.floor(Math.random()*types.length)]));
      }
    },
    {
      icon:"🏦",name:"Jackpot Surge",text:"The City Jackpot increases by 350.",
      run:()=>room.state.jackpot=(room.state.jackpot||0)+350
    },
    {
      icon:"🏠",name:"Property Dividend",text:"Owners receive 45 for each property they own.",
      run:()=>active.forEach(p=>p.cash+=45*p.properties.length)
    },
    {
      icon:"🧱",name:"Free Construction",text:"One random eligible property gets a free upgrade.",
      run:()=>{
        const eligible=[];
        active.forEach(p=>p.properties.forEach(idx=>{
          if((room.state.levels[idx]||0)<3) eligible.push({p,idx});
        }));
        if(eligible.length){
          const pick=eligible[Math.floor(Math.random()*eligible.length)];
          room.state.levels[pick.idx]++;
          addLog(room,`🧱 ${pick.p.name}'s ${boardData[pick.idx].name} received a free upgrade!`);
        }else{
          room.state.jackpot=(room.state.jackpot||0)+200;
        }
      }
    },
    {
      icon:"🌱",name:"Comeback Bonus",text:"Players with no property receive 180.",
      run:()=>active.filter(p=>p.properties.length===0).forEach(p=>p.cash+=180)
    }
  ];
  const e=events[Math.floor(Math.random()*events.length)];
  e.run();
  room.state.chaosEvent={icon:e.icon,name:e.name,text:e.text,round:room.state.round};
  addLog(room,`${e.icon} CITY CHAOS: ${e.name} — ${e.text}`);
}

function resolveFestivalChoice(room,p,choice) {
  const pending=room.state.pendingRisk;
  if(!pending) throw new Error("No festival decision pending");
  const base=pending.amount;
  const safeReward=Math.round(base*market(room).festivalMult);
  let reward=0;

  if(choice==="safe"){
    reward=safeReward;
    addLog(room,`🎪 ${p.name} took the safe festival reward: ${reward}.`);
  }else if(choice==="risk"){
    const chance=p.character==="frog"?.65:.50;
    const won=Math.random()<chance;
    reward=won?safeReward*2:0;
    addLog(room,won
      ?`🎰 ${p.name} risked the festival reward and WON ${reward}!`
      :`🎰 ${p.name} risked the festival reward and lost it.`);
  }else{
    throw new Error("Invalid festival choice");
  }

  p.cash+=reward;
  room.state.pendingRisk=null;
  room.state.turnStage="end";
  maybeStreetDuel(room,p);
  checkMissions(room);
}

function checkBankruptcy(room,p) {
  if(p.bankrupt || p.cash>=0) return false;
  p.bankrupt=true;
  p.cash=0;
  p.properties.forEach(idx=>{
    room.state.owners[idx]=null;
    room.state.levels[idx]=0;
  });
  p.properties=[];
  addLog(room,`💥 ${p.name} is bankrupt. Their properties returned to the city.`);
  if(activePlayers(room).length<=1) finishGame(room);
  return true;
}
function finishGame(room) {
  if(room.state.finished) return;
  room.state.finished=true;
  room.state.turnStage="finished";
  room.phase="finished";
  const ranked=[...room.state.players].sort((a,b)=>netWorth(room,b)-netWorth(room,a));
  if(ranked.length){
    const top=netWorth(room,ranked[0]);
    room.state.winnerIds=ranked.filter(p=>netWorth(room,p)===top).map(p=>p.id);
    const winners=ranked.filter(p=>room.state.winnerIds.includes(p.id)).map(p=>p.name).join(" & ");
    addLog(room,`🏆 ${winners} wins Cartoon City Tycoon!`);
  }
  clearAuctionTimer(room.code);
  clearMiniGameTimer(room.code);
}

function clearMiniGameTimer(code) {
  const t=miniGameTimers.get(code);
  if(t) clearTimeout(t);
  miniGameTimers.delete(code);
}

function miniParticipants(room) {
  if(!room.state) return [];
  return room.state.players
    .filter(p => !p.bankrupt && roomPlayerById(room,p.id)?.connected)
    .map(p => p.id);
}

function randomMathQuestion() {
  const mode=Math.floor(Math.random()*3);
  if(mode===0){
    const a=8+Math.floor(Math.random()*42), b=5+Math.floor(Math.random()*35);
    return {question:`${a} + ${b} = ?`,answer:a+b};
  }
  if(mode===1){
    const a=4+Math.floor(Math.random()*9), b=3+Math.floor(Math.random()*9);
    return {question:`${a} × ${b} = ?`,answer:a*b};
  }
  const b=5+Math.floor(Math.random()*25), answer=8+Math.floor(Math.random()*35);
  const a=b+answer;
  return {question:`${a} − ${b} = ?`,answer};
}

function shuffledTreasureRewards() {
  const values=[30,50,70,90,110,130,150,180,210,240,280,320];
  for(let i=values.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [values[i],values[j]]=[values[j],values[i]];
  }
  return values;
}

function startMiniGame(room) {
  clearMiniGameTimer(room.code);
  const participants=miniParticipants(room);
  if(participants.length<2) return false;

  const types=["quickMath","treasure","dicePrediction","reaction","closestNumber","rps"];
  const type=types[Math.floor(Math.random()*types.length)];
  const now=Date.now();
  const mg={
    id:crypto.randomUUID(),
    type,
    title:"",
    instructions:"",
    participants,
    submittedIds:[],
    leaders:[],
    results:[],
    resolved:false,
    startAt:now,
    endsAt:now+15000,
    resultsUntil:null,
    question:null,
    chestCount:12,
    reveal:null
  };
  const secret={submissions:{},attempts:{}};

  if(type==="quickMath"){
    const q=randomMathQuestion();
    mg.title="🧠 Quick Math Race";
    mg.instructions="Solve it fast. The first 3 correct answers win bonus cash.";
    mg.question=q.question;
    mg.endsAt=now+16000;
    secret.answer=q.answer;
  }else if(type==="treasure"){
    mg.title="🎁 Treasure Pick";
    mg.instructions="Choose one treasure chest. Everyone may choose once.";
    mg.endsAt=now+15000;
    secret.rewards=shuffledTreasureRewards();
  }else if(type==="dicePrediction"){
    mg.title="🎲 Dice Prediction";
    mg.instructions="Predict LOW (2–6), EXACT 7, or HIGH (8–12).";
    mg.endsAt=now+14000;
  }else if(type==="reaction"){
    mg.title="⚡ Reaction Rush";
    mg.instructions="Wait for GO, then hit the reaction button. Clicking early does not count.";
    mg.startAt=now+2200+Math.floor(Math.random()*2800);
    mg.endsAt=mg.startAt+7000;
  }else if(type==="closestNumber"){
    mg.title="🎯 Closest Number";
    mg.instructions="Guess a number from 1 to 100. The closest guesses win.";
    mg.endsAt=now+15000;
    secret.target=1+Math.floor(Math.random()*100);
  }else{
    mg.title="✊ Boss RPS";
    mg.instructions="Choose Rock, Paper or Scissors. Beat the City Boss hand to win bonus cash.";
    mg.endsAt=now+14000;
  }

  room.state.miniGame=mg;
  room.miniSecret=secret;
  room.state.turnStage="miniGame";
  addLog(room,`🎮 Mini-game started: ${mg.title.replace(/^[^\s]+\s/,"")}.`);
  scheduleMiniGame(room);
  return true;
}

function scheduleMiniGame(room) {
  clearMiniGameTimer(room.code);
  const mg=room.state?.miniGame;
  if(!mg) return;
  const target=mg.resolved ? mg.resultsUntil : mg.endsAt;
  const delay=Math.max(100,target-Date.now());
  const timer=setTimeout(()=>{
    if(mg.resolved) resumeMiniGame(room.code);
    else finalizeMiniGame(room.code);
  },delay);
  miniGameTimers.set(room.code,timer);
}

function miniEligibleNow(room) {
  const mg=room.state?.miniGame;
  if(!mg) return [];
  return mg.participants.filter(id=>{
    const rp=roomPlayerById(room,id);
    const gp=room.state.players[id];
    return rp?.connected && gp && !gp.bankrupt;
  });
}

function maybeFinalizeMiniEarly(room) {
  const mg=room.state?.miniGame;
  if(!mg || mg.resolved) return;
  const eligible=miniEligibleNow(room);
  if(!eligible.length) return finalizeMiniGame(room.code);

  if(["treasure","dicePrediction","closestNumber","rps"].includes(mg.type)){
    if(eligible.every(id=>mg.submittedIds.includes(id))) finalizeMiniGame(room.code);
  }else if(["quickMath","reaction"].includes(mg.type)){
    const target=Math.min(3,eligible.length);
    if(mg.leaders.length>=target) finalizeMiniGame(room.code);
  }
}

function miniRewardPlayer(room,id,reward,label,results) {
  const p=room.state.players[id];
  if(!p || p.bankrupt) return;
  p.cash+=reward;
  results.push({playerId:id,name:p.name,reward,label});
}

function finalizeMiniGame(code) {
  const room=rooms.get(code);
  const mg=room?.state?.miniGame;
  if(!room || !mg || mg.resolved) return;

  clearMiniGameTimer(code);
  const secret=room.miniSecret || {submissions:{}};
  const results=[];

  if(mg.type==="quickMath" || mg.type==="reaction"){
    const prizes=[200,130,80];
    mg.leaders.slice(0,3).forEach((id,i)=>{
      miniRewardPlayer(room,id,prizes[i]||50,`${i+1}${i===0?"st":i===1?"nd":"rd"} place`,results);
    });
    mg.participants.filter(id=>!mg.leaders.includes(id)).forEach(id=>{
      if(roomPlayerById(room,id)?.connected) miniRewardPlayer(room,id,20,"participation",results);
    });
  }else if(mg.type==="treasure"){
    for(const [idRaw,chestRaw] of Object.entries(secret.submissions||{})){
      const id=Number(idRaw), chest=Number(chestRaw);
      const reward=secret.rewards?.[chest] ?? 40;
      miniRewardPlayer(room,id,reward,`Chest ${chest+1}`,results);
    }
  }else if(mg.type==="dicePrediction"){
    const d1=1+Math.floor(Math.random()*6), d2=1+Math.floor(Math.random()*6);
    const total=d1+d2;
    const actual=total===7?"seven":total<7?"low":"high";
    mg.reveal={d1,d2,total,actual};
    for(const [idRaw,pick] of Object.entries(secret.submissions||{})){
      const id=Number(idRaw);
      let reward=20,label="miss";
      if(pick===actual){
        reward=pick==="seven"?300:160;
        label=pick==="seven"?"Exact 7!":"Correct prediction";
      }
      miniRewardPlayer(room,id,reward,label,results);
    }
  }else if(mg.type==="closestNumber"){
    const target=Number(secret.target);
    mg.reveal={target};
    const guesses=Object.entries(secret.submissions||{}).map(([idRaw,value])=>({
      id:Number(idRaw),value:Number(value),diff:Math.abs(Number(value)-target)
    })).sort((a,b)=>a.diff-b.diff || a.id-b.id);
    const prizes=[220,140,90];
    guesses.forEach((g,i)=>{
      miniRewardPlayer(room,g.id,i<3?prizes[i]:20,i<3?`Guess ${g.value} • ${i+1}${i===0?"st":i===1?"nd":"rd"} closest`:`Guess ${g.value}`,results);
    });
  }else if(mg.type==="rps"){
    const hands=["rock","paper","scissors"];
    const boss=hands[Math.floor(Math.random()*hands.length)];
    mg.reveal={boss};
    const beats={rock:"scissors",paper:"rock",scissors:"paper"};
    for(const [idRaw,pick] of Object.entries(secret.submissions||{})){
      const id=Number(idRaw);
      let reward=15,label=`${pick} vs ${boss} • loss`;
      if(pick===boss){reward=45;label=`${pick} vs ${boss} • tie`;}
      else if(beats[pick]===boss){reward=170;label=`${pick} beats ${boss}!`;}
      miniRewardPlayer(room,id,reward,label,results);
    }
  }

  mg.results=results.sort((a,b)=>b.reward-a.reward);
  mg.resolved=true;
  mg.resultsUntil=Date.now()+5500;
  checkMissions(room);
  addLog(room,`🏁 ${mg.title.replace(/^[^\s]+\s/,"")} finished. Rewards were paid.`);
  emitRoom(room);
  scheduleMiniGame(room);
}

function resumeMiniGame(code) {
  const room=rooms.get(code);
  if(!room?.state?.miniGame) return;
  clearMiniGameTimer(code);
  room.state.miniGame=null;
  room.miniSecret=null;

  if(room.state.finished) return emitRoom(room);

  const p=currentPlayer(room);
  if(p.skip>0){
    p.skip--;
    room.state.turnStage="skip";
    addLog(room,`🚧 ${p.name} must skip this turn.`);
  }else{
    room.state.turnStage="roll";
  }
  emitRoom(room);
  maybeScheduleDisconnectedTurn(room);
}

function submitMiniGame(room,p,value) {
  const mg=room.state?.miniGame;
  if(!mg || mg.resolved) throw new Error("No active mini-game");
  if(!mg.participants.includes(p.id)) throw new Error("You are not in this mini-game");
  if(p.bankrupt) throw new Error("Bankrupt players cannot enter");

  room.miniSecret ||= {submissions:{},attempts:{}};
  const secret=room.miniSecret;
  secret.submissions ||= {};
  secret.attempts ||= {};

  if(mg.type==="quickMath"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already finished");
    secret.attempts[p.id]=(secret.attempts[p.id]||0)+1;
    const answer=Number(value);
    if(answer===Number(secret.answer)){
      secret.submissions[p.id]=answer;
      mg.submittedIds.push(p.id);
      if(!mg.leaders.includes(p.id)) mg.leaders.push(p.id);
      addLog(room,`🧠 ${p.name} solved the mini-game question!`);
    }else if(secret.attempts[p.id]>=3){
      mg.submittedIds.push(p.id);
      addLog(room,`🧠 ${p.name} used all 3 math attempts.`);
    }else{
      throw new Error(`Wrong answer — ${3-secret.attempts[p.id]} attempt(s) left`);
    }
  }else if(mg.type==="treasure"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already picked");
    const chest=Math.floor(Number(value));
    if(!Number.isFinite(chest) || chest<0 || chest>=mg.chestCount) throw new Error("Invalid chest");
    secret.submissions[p.id]=chest;
    mg.submittedIds.push(p.id);
  }else if(mg.type==="dicePrediction"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already predicted");
    if(!["low","seven","high"].includes(value)) throw new Error("Invalid prediction");
    secret.submissions[p.id]=value;
    mg.submittedIds.push(p.id);
  }else if(mg.type==="closestNumber"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already guessed");
    const guess=Math.floor(Number(value));
    if(!Number.isFinite(guess)||guess<1||guess>100) throw new Error("Guess must be from 1 to 100");
    secret.submissions[p.id]=guess;
    mg.submittedIds.push(p.id);
  }else if(mg.type==="rps"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already chose");
    if(!["rock","paper","scissors"].includes(value)) throw new Error("Invalid choice");
    secret.submissions[p.id]=value;
    mg.submittedIds.push(p.id);
  }else if(mg.type==="reaction"){
    if(mg.submittedIds.includes(p.id)) throw new Error("You already clicked");
    if(Date.now()<mg.startAt) throw new Error("Too early! Wait for GO.");
    if(Date.now()>mg.endsAt) throw new Error("Too late");
    secret.submissions[p.id]=Date.now();
    mg.submittedIds.push(p.id);
    if(!mg.leaders.includes(p.id)) mg.leaders.push(p.id);
  }

  maybeFinalizeMiniEarly(room);
}


function newMarket(room) {
  room.state.market=chooseMarket();
  addLog(room,`${room.state.market.icon} New city market: ${room.state.market.name}.`);
}
function advanceTurn(room) {
  if(room.state.finished) return;

  const current=currentPlayer(room);
  if(room.state.extraRoll && current && !current.bankrupt && current.skip===0){
    room.state.extraRoll=false;
    room.state.lastRoll=null;
    room.state.pendingBuy=null;
    room.state.pendingRisk=null;
    room.state.auction=null;
    room.state.turnStage="roll";
    addLog(room,`🎲 DOUBLES! ${current.name} gets another roll.`);
    return;
  }

  let next=room.state.current, guard=0;
  do{
    next=(next+1)%room.state.players.length;
    guard++;
  }while(room.state.players[next].bankrupt && guard<=room.state.players.length);

  let startedNewRound=false;
  if(next<=room.state.current){
    room.state.round++;
    startedNewRound=true;
    if(room.state.maxRounds && room.state.round>room.state.maxRounds){
      finishGame(room);
      return;
    }
    newMarket(room);
    if(room.state.round%4===0) runChaosEvent(room);
  }

  room.state.current=next;
  room.state.extraRoll=false;
  room.state.lastRoll=null;
  room.state.pendingBuy=null;
  room.state.auction=null;

  const every=Number(room.settings?.miniGameEvery || 0);
  if(startedNewRound && every>0 && room.state.round>1 && room.state.round%every===0){
    if(startMiniGame(room)) return;
  }

  const p=currentPlayer(room);
  if(p.skip>0){
    p.skip--;
    room.state.turnStage="skip";
    addLog(room,`🚧 ${p.name} must skip this turn.`);
  }else{
    room.state.turnStage="roll";
  }
  maybeScheduleDisconnectedTurn(room);
}

function startAuction(room,idx) {
  clearAuctionTimer(room.code);
  const t=boardData[idx];
  room.state.pendingBuy=null;
  room.state.turnStage="auction";
  room.state.auction={
    propertyIdx:idx,
    highestBid:Math.max(10,Math.floor(t.price*.45/10)*10),
    highestBidder:null,
    endsAt:Date.now()+room.settings.auctionSeconds*1000
  };
  addLog(room,`🔨 ${t.name} entered a ${room.settings.auctionSeconds}-second auction.`);
  scheduleAuction(room);
}
function scheduleAuction(room) {
  clearAuctionTimer(room.code);
  if(!room.state?.auction) return;
  const delay=Math.max(100,room.state.auction.endsAt-Date.now());
  const timer=setTimeout(()=>finalizeAuction(room.code),delay);
  auctionTimers.set(room.code,timer);
}
function clearAuctionTimer(code) {
  const t=auctionTimers.get(code);
  if(t) clearTimeout(t);
  auctionTimers.delete(code);
}
function finalizeAuction(code) {
  const room=rooms.get(code);
  if(!room || !room.state?.auction) return;
  const a=room.state.auction;
  const idx=a.propertyIdx;
  const t=boardData[idx];
  if(a.highestBidder!==null && room.state.owners[idx]===null){
    const winner=room.state.players[a.highestBidder];
    if(winner && !winner.bankrupt && winner.cash>=a.highestBid){
      winner.cash-=a.highestBid;
      winner.properties.push(idx);
      room.state.owners[idx]=winner.id;
      room.state.levels[idx]=0;
      addLog(room,`🔨 ${winner.name} won ${t.name} for ${a.highestBid}.`);
    }else{
      addLog(room,`🔨 Auction for ${t.name} ended without a valid winner.`);
    }
  }else{
    addLog(room,`🔨 Auction for ${t.name} ended with no bids.`);
  }
  room.state.auction=null;
  room.state.turnStage="end";
  checkMissions(room);
  emitRoom(room);
  maybeScheduleDisconnectedTurn(room);
}
function bidAuction(room,p,amount) {
  const a=room.state.auction;
  if(!a) throw new Error("No active auction");
  amount=Math.floor(Number(amount)/10)*10;
  const minimum=a.highestBidder===null ? a.highestBid : a.highestBid+10;
  if(!Number.isFinite(amount) || amount<minimum) throw new Error(`Minimum bid is ${minimum}`);
  if(p.bankrupt || p.cash<amount) throw new Error("Not enough cash for that bid");
  a.highestBid=amount;
  a.highestBidder=p.id;
  if(a.endsAt-Date.now()<5000){
    a.endsAt=Date.now()+5000;
    scheduleAuction(room);
  }
  addLog(room,`🔨 ${p.name} bid ${amount} on ${boardData[a.propertyIdx].name}.`);
}

function resolveLanding(room) {
  const p=currentPlayer(room);
  const idx=p.pos;
  const t=boardData[idx];
  room.state.pendingBuy=null;

  if(t.type==="property"){
    const owner=room.state.owners[idx];
    if(owner===null){
      const price=buyPrice(room,p,idx);
      if(p.cash>=price){
        room.state.pendingBuy=idx;
        room.state.turnStage="buyDecision";
        addLog(room,`🏠 ${p.name} landed on unowned ${t.name}.`);
        return;
      }
      addLog(room,`🏠 ${p.name} cannot afford ${t.name}. It goes to auction.`);
      startAuction(room,idx);
      return;
    }
    if(owner===p.id){
      addLog(room,`🏡 ${p.name} landed on their own ${t.name}.`);
    }else{
      const landlord=room.state.players[owner];
      transferRent(room,p,landlord,rentFor(room,idx),`rent at ${t.name}`);
      checkBankruptcy(room,p);
    }
  }else if(t.type==="chance"){
    addLog(room,`${p.name}: ${chanceEvent(room,p)}`);
    checkBankruptcy(room,p);
  }else if(t.type==="tax"){
    payBank(room,p,t.amount,t.name,true);
    checkBankruptcy(room,p);
  }else if(t.type==="festival"){
    room.state.pendingRisk={amount:t.amount,tileName:t.name};
    room.state.turnStage="riskDecision";
    addLog(room,`🎪 ${p.name} may take the festival reward safely or gamble for double.`);
    return;
  }else if(t.type==="rest"){
    const jackpot=Math.max(0,Math.round(room.state.jackpot||0));
    p.cash+=jackpot;
    room.state.jackpot=200;
    addLog(room,`🏦 JACKPOT! ${p.name} collected ${jackpot} at Chill Zone! Jackpot resets to 200.`);
  }else if(t.type==="jail"){
    addLog(room,`🚧 ${p.name} is just visiting Detention.`);
  }else{
    addLog(room,`🚩 ${p.name} landed on City Gate.`);
  }

  maybeStreetDuel(room,p);
  checkMissions(room);
  if(!room.state.finished && room.state.turnStage!=="auction") room.state.turnStage="end";
}

function useCard(room,p,type) {
  if(!p.cards[type] || p.cards[type]<=0) throw new Error("You do not have that card");
  if(type==="turbo"){
    if(room.state.turnStage!=="roll") throw new Error("Turbo must be used before rolling");
    p.cards.turbo--;p.buffs.turbo=true;
    addLog(room,`⚡ ${p.name} activated Turbo +3.`);
  }else if(type==="rentBoost"){
    p.cards.rentBoost--;p.buffs.rentBoost=true;
    addLog(room,`🔥 ${p.name} armed Double Rent for the next rent collected.`);
  }else{
    throw new Error("That card activates automatically when needed");
  }
}

function scheduleDisconnectSkip(room,pid) {
  cancelDisconnectSkip(room.code,pid);
  const key=`${room.code}:${pid}`;
  const t=setTimeout(()=>{
    disconnectTimers.delete(key);
    const r=rooms.get(room.code);
    if(!r || r.phase!=="playing" || !r.state || r.state.finished) return;
    const rp=roomPlayerById(r,pid);
    if(!rp || rp.connected) return;
    if(r.state.current!==pid) return;

    const stage=r.state.turnStage;
    if(stage==="buyDecision" && r.state.pendingBuy!==null){
      startAuction(r,r.state.pendingBuy);
      addLog(r,`⏱️ ${rp.name} stayed offline, so the property was sent to auction.`);
      emitRoom(r);
      return;
    }
    if(stage==="riskDecision" && r.state.pendingRisk){
      try{
        resolveFestivalChoice(r,currentPlayer(r),"safe");
        addLog(r,`⏱️ ${rp.name} stayed offline, so the safe festival reward was chosen automatically.`);
      }catch(e){}
      emitRoom(r);
      return;
    }
    if(stage==="auction") return;
    addLog(r,`⏱️ ${rp.name} stayed offline, so their turn was automatically skipped.`);
    r.state.extraRoll=false;
    advanceTurn(r);
    emitRoom(r);
  },45000);
  disconnectTimers.set(key,t);
}
function cancelDisconnectSkip(code,pid) {
  const key=`${code}:${pid}`;
  const t=disconnectTimers.get(key);
  if(t) clearTimeout(t);
  disconnectTimers.delete(key);
}
function maybeScheduleDisconnectedTurn(room) {
  if(room.phase!=="playing" || !room.state || room.state.finished) return;
  const cp=currentPlayer(room);
  const rp=roomPlayerById(room,cp.id);
  if(rp && !rp.connected) scheduleDisconnectSkip(room,cp.id);
}

function persistSoon() {
  if(persistTimer) return;
  persistTimer=setTimeout(()=>{
    persistTimer=null;
    try{
      fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});
      const payload=[...rooms.values()].map(room=>({
        ...room,
        players:room.players.map(p=>({...p,socketId:null,connected:false,voice:false}))
      }));
      fs.writeFileSync(DATA_FILE,JSON.stringify(payload,null,2));
    }catch(e){ console.error("Persist error:",e.message); }
  },500);
}
function loadRooms() {
  try{
    if(!fs.existsSync(DATA_FILE)) return;
    const arr=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
    for(const raw of arr){
      if(!raw?.code || !Array.isArray(raw.players)) continue;
      raw.settings ||= {};
      raw.settings.maxPlayers ||= 12;
      if(raw.settings.miniGameEvery===undefined) raw.settings.miniGameEvery=3;
      raw.settings.auctionSeconds ||= 18;
      raw.players=raw.players.map(p=>({...p,socketId:null,connected:false,voice:false}));
      if(raw.state?.players) raw.state.players=raw.state.players.map(p=>({...p,connected:false}));
      rooms.set(raw.code,raw);
      if(raw.state?.auction){
        if(raw.state.auction.endsAt<=Date.now()) setTimeout(()=>finalizeAuction(raw.code),100);
        else scheduleAuction(raw);
      }
      if(raw.state?.miniGame){
        if(raw.state.miniGame.resolved && raw.state.miniGame.resultsUntil<=Date.now()) setTimeout(()=>resumeMiniGame(raw.code),150);
        else if(!raw.state.miniGame.resolved && raw.state.miniGame.endsAt<=Date.now()) setTimeout(()=>finalizeMiniGame(raw.code),150);
        else scheduleMiniGame(raw);
      }
    }
    console.log(`Loaded ${rooms.size} persisted room(s).`);
  }catch(e){ console.error("Room restore error:",e.message); }
}
loadRooms();

function rateLimit(socket,key,ms) {
  socket.data.rates ||= {};
  const now=Date.now();
  if(now-(socket.data.rates[key]||0)<ms) return false;
  socket.data.rates[key]=now;
  return true;
}

io.on("connection", socket => {
  socket.emit("hello",{socketId:socket.id,boardData,characters,rtcConfig:rtcConfig()});

  socket.on("room:create",({name,character,avatar,frame,skinMode},cb)=>{
    try{
      const {room,token}=createRoom(socket,name,character,avatar,frame,skinMode);
      emitRoom(room);
      cb?.({ok:true,code:room.code,playerId:0,sessionToken:token});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("room:join",({code,name,character,avatar,frame,skinMode},cb)=>{
    try{
      const room=rooms.get(safeText(code,5).toUpperCase());
      if(!room) throw new Error("Room not found");
      const {player,token}=addPlayer(room,socket,name,character,avatar,frame,skinMode);
      emitRoom(room);
      cb?.({ok:true,code:room.code,playerId:player.id,sessionToken:token});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("room:reconnect",({code,sessionToken},cb)=>{
    try{
      const room=rooms.get(safeText(code,5).toUpperCase());
      if(!room) throw new Error("Room no longer exists");
      const p=reconnectPlayer(room,socket,safeText(sessionToken,80));
      emitRoom(room);
      cb?.({ok:true,code:room.code,playerId:p.id});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("room:profile",({name,character,avatar,frame,skinMode})=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room || !p || room.phase!=="lobby") return;
    p.name=safeText(name,16)||p.name;
    p.character=characterKey(character);
    p.avatar = avatar === undefined ? (p.avatar || "") : safeAvatar(avatar);
    p.frame = frame === undefined ? (p.frame || "rare") : frameKey(frame);
    p.skinMode = skinMode === undefined ? (p.skinMode || "character") : skinModeKey(skinMode);
    addLog(room,`🎭 ${p.name} updated their character/profile.`);
    emitRoom(room);
  });

  socket.on("room:settings",settings=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room || !p || p.id!==room.hostPlayerId || room.phase!=="lobby") return;
    const rounds=Number(settings?.maxRounds);
    const cash=Number(settings?.startingCash);
    const auctionSeconds=Number(settings?.auctionSeconds);
    const maxPlayers=Number(settings?.maxPlayers);
    const miniGameEvery=Number(settings?.miniGameEvery);
    if([0,12,20,30,40].includes(rounds)) room.settings.maxRounds=rounds;
    if([1200,1600,2200,3000].includes(cash)) room.settings.startingCash=cash;
    if([12,18,25,30].includes(auctionSeconds)) room.settings.auctionSeconds=auctionSeconds;
    if([6,8,10,12].includes(maxPlayers) && maxPlayers>=room.players.length) room.settings.maxPlayers=maxPlayers;
    if([0,2,3,4,5].includes(miniGameEvery)) room.settings.miniGameEvery=miniGameEvery;
    emitRoom(room);
  });


  socket.on("game:rematch",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const rp=room && roomPlayerBySocket(room,socket);
    if(!room) return cb?.({ok:false,error:"Room not found"});
    if(!rp || rp.id!==room.hostPlayerId) return cb?.({ok:false,error:"Only the host can restart the match"});
    if(room.phase!=="finished") return cb?.({ok:false,error:"The current match has not ended"});
    clearAuctionTimer(room.code);
    clearMiniGameTimer(room.code);
    room.phase="playing";
    room.state=startState(room);
    addLog(room,`🔁 ${rp.name} started a rematch with the same room and players.`);
    addLog(room,`${room.state.market.icon} Starting market: ${room.state.market.name}.`);
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("game:returnLobby",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const rp=room && roomPlayerBySocket(room,socket);
    if(!room) return cb?.({ok:false,error:"Room not found"});
    if(!rp || rp.id!==room.hostPlayerId) return cb?.({ok:false,error:"Only the host can return to lobby"});
    if(room.phase!=="finished") return cb?.({ok:false,error:"The current match has not ended"});
    clearAuctionTimer(room.code);
    clearMiniGameTimer(room.code);
    room.phase="lobby";
    room.state=null;
    addLog(room,`🏠 ${rp.name} returned everyone to the lobby.`);
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("game:start",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room) return cb?.({ok:false,error:"Room not found"});
    if(!p || p.id!==room.hostPlayerId) return cb?.({ok:false,error:"Only the host can start"});
    if(room.players.filter(x=>x.connected).length<2) return cb?.({ok:false,error:"Need at least 2 connected players"});
    room.phase="playing";
    room.state=startState(room);
    addLog(room,`🎲 Game started with ${room.players.length} players.`);
    addLog(room,`${room.state.market.icon} Starting market: ${room.state.market.name}.`);
    checkMissions(room);
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("game:roll",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    if(room.state.turnStage!=="roll")
      return cb?.({ok:false,error:"You cannot roll now"});

    const p=currentPlayer(room);
    const d1=1+Math.floor(Math.random()*6);
    const d2=1+Math.floor(Math.random()*6);
    const bonus=p.buffs.turbo?3:0;
    p.buffs.turbo=false;
    const doubles=d1===d2;

    if(doubles) p.doublesStreak=(p.doublesStreak||0)+1;
    else p.doublesStreak=0;

    room.state.lastRoll=[d1,d2,bonus];
    room.state.extraRoll=doubles;

    if(p.doublesStreak>=3){
      p.doublesStreak=0;
      room.state.extraRoll=false;
      p.pos=10;
      p.skip=1;
      room.state.turnStage="end";
      addLog(room,`🚓 THREE DOUBLES! ${p.name} is sent straight to Detention and will miss the next turn.`);
      emitRoom(room);
      return cb?.({ok:true,roll:[d1,d2],bonus,doubles:true,detention:true});
    }

    addLog(room,`🎲 ${p.name} rolled ${d1}+${d2}${bonus?` + Turbo ${bonus}`:""} = ${d1+d2+bonus}${doubles?" • DOUBLES!":""}.`);
    movePlayer(room,p,d1+d2+bonus);
    resolveLanding(room);

    if(p.skip>0) room.state.extraRoll=false;
    emitRoom(room);
    cb?.({ok:true,roll:[d1,d2],bonus});
  });

  socket.on("game:buy",({buy},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    if(room.state.turnStage!=="buyDecision" || room.state.pendingBuy===null)
      return cb?.({ok:false,error:"No property decision pending"});

    const p=currentPlayer(room);
    const idx=room.state.pendingBuy;
    const t=boardData[idx];
    const price=buyPrice(room,p,idx);

    if(buy){
      if(room.state.owners[idx]!==null || p.cash<price)
        return cb?.({ok:false,error:"Property cannot be purchased"});
      p.cash-=price;
      p.properties.push(idx);
      room.state.owners[idx]=p.id;
      room.state.levels[idx]=0;
      room.state.pendingBuy=null;
      room.state.turnStage="end";
      addLog(room,`🏠 ${p.name} bought ${t.name} for ${price}.`);
      checkMissions(room);
    }else{
      addLog(room,`⏭️ ${p.name} skipped ${t.name}; auction begins.`);
      startAuction(room,idx);
    }

    emitRoom(room);
    cb?.({ok:true});
  });


  socket.on("game:festivalChoice",({choice},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    if(room.state.turnStage!=="riskDecision" || !room.state.pendingRisk)
      return cb?.({ok:false,error:"No festival choice pending"});
    try{
      resolveFestivalChoice(room,currentPlayer(room),safeText(choice,12));
      emitRoom(room);
      cb?.({ok:true});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("game:upgrade",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    if(!["end","buyDecision"].includes(room.state.turnStage))
      return cb?.({ok:false,error:"You cannot upgrade right now"});

    const p=currentPlayer(room);
    const idx=p.pos;
    const t=boardData[idx];
    if(!t || t.type!=="property" || room.state.owners[idx]!==p.id)
      return cb?.({ok:false,error:"You do not own this property"});
    const lvl=room.state.levels[idx]||0;
    if(lvl>=3) return cb?.({ok:false,error:"Already fully upgraded"});
    const cost=upgradeCost(room,p,idx);
    if(p.cash<cost) return cb?.({ok:false,error:"Not enough cash"});
    p.cash-=cost;
    room.state.levels[idx]++;
    addLog(room,`🏗️ ${p.name} upgraded ${t.name} to level ${room.state.levels[idx]} for ${cost}.`);
    checkMissions(room);
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("game:useCard",({type},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    try{
      useCard(room,currentPlayer(room),safeText(type,20));
      emitRoom(room);
      cb?.({ok:true});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("auction:bid",({amount},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const rp=room && roomPlayerBySocket(room,socket);
    if(!room || room.phase!=="playing" || !rp)
      return cb?.({ok:false,error:"Room unavailable"});
    try{
      bidAuction(room,room.state.players[rp.id],amount);
      emitRoom(room);
      cb?.({ok:true});
    }catch(e){cb?.({ok:false,error:e.message});}
  });

  socket.on("game:endTurn",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || room.phase!=="playing" || !actorIsCurrent(room,socket))
      return cb?.({ok:false,error:"Not your turn"});
    if(!["end","skip"].includes(room.state.turnStage))
      return cb?.({ok:false,error:"Finish the current action first"});
    advanceTurn(room);
    emitRoom(room);
    cb?.({ok:true});
  });


  socket.on("minigame:submit",({value},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const rp=room && roomPlayerBySocket(room,socket);
    if(!room || room.phase!=="playing" || !rp)
      return cb?.({ok:false,error:"Room unavailable"});
    if(!rateLimit(socket,"minigame",100))
      return cb?.({ok:false,error:"Too fast"});
    try{
      submitMiniGame(room,room.state.players[rp.id],value);
      emitRoom(room);
      cb?.({ok:true});
    }catch(e){
      cb?.({ok:false,error:e.message});
    }
  });

  socket.on("chat:send",({text},cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room || !p) return cb?.({ok:false,error:"Not in a room"});
    if(!rateLimit(socket,"chat",600)) return cb?.({ok:false,error:"Slow down a little"});
    text=safeText(text,240);
    if(!text) return cb?.({ok:false,error:"Message is empty"});
    const msg=addChat(room,p,text);
    io.to(room.code).emit("chat:new",msg);
    persistSoon();
    cb?.({ok:true});
  });

  // WebRTC voice signaling. Audio itself is peer-to-peer; server only forwards signaling data.
  socket.on("voice:join",(_,cb)=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room || !p) return cb?.({ok:false,error:"Not in a room"});
    p.voice=true;
    const peers=room.players.filter(x=>x.connected && x.voice && x.id!==p.id).map(x=>x.id);
    socket.emit("voice:peers",peers);
    socket.to(room.code).emit("voice:peerJoined",{playerId:p.id});
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("voice:leave",()=>{
    const room=rooms.get(socket.data.roomCode);
    const p=room && roomPlayerBySocket(room,socket);
    if(!room || !p) return;
    p.voice=false;
    socket.to(room.code).emit("voice:peerLeft",{playerId:p.id});
    emitRoom(room);
  });

  socket.on("voice:signal",({target,kind,data})=>{
    const room=rooms.get(socket.data.roomCode);
    const from=room && roomPlayerBySocket(room,socket);
    const to=room && roomPlayerById(room,Number(target));
    if(!room || !from || !to || !to.connected || !to.socketId) return;
    if(!["offer","answer","ice"].includes(kind)) return;
    io.to(to.socketId).emit("voice:signal",{from:from.id,kind,data});
  });

  socket.on("disconnect",()=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room) return;
    const p=roomPlayerById(room,socket.data.playerId);
    if(!p) return;
    if(p.socketId!==socket.id) return; // stale socket replaced by reconnect

    p.connected=false;
    p.voice=false;
    p.socketId=null;
    p.lastSeen=Date.now();
    if(room.state?.players?.[p.id]) room.state.players[p.id].connected=false;
    socket.to(room.code).emit("voice:peerLeft",{playerId:p.id});
    addLog(room,`🔌 ${p.name} disconnected. Reconnect window is active.`);
    emitRoom(room);

    if(room.phase==="playing" && room.state?.current===p.id){
      scheduleDisconnectSkip(room,p.id);
    }

    if(room.phase==="lobby" && p.id===room.hostPlayerId){
      setTimeout(()=>{
        const r=rooms.get(room.code);
        const host=r && roomPlayerById(r,r.hostPlayerId);
        if(!r || r.phase!=="lobby" || (host && host.connected)) return;
        const next=r.players.find(x=>x.connected);
        if(next){
          r.hostPlayerId=next.id;
          addLog(r,`👑 ${next.name} became host after the old host stayed offline.`);
          emitRoom(r);
        }
      },60000);
    }
  });
});

// Delete very old abandoned rooms once per hour.
setInterval(()=>{
  const cutoff=Date.now()-1000*60*60*24*3;
  for(const [code,room] of rooms){
    const nobody=room.players.every(p=>!p.connected);
    if(nobody && room.updatedAt<cutoff){
      clearAuctionTimer(code);
      clearMiniGameTimer(code);
      rooms.delete(code);
    }
  }
  persistSoon();
},60*60*1000);

server.listen(PORT,()=>console.log(`Cartoon City Tycoon Online V2 listening on port ${PORT}`));
