// Records the five "See how it works" clips from the dev preview sample data.
//   VITE_DEV_BYPASS_AUTH=true VITE_CALMSKY_REDESIGN=true npx vite --port 5183 &
//   CHROME_PATH=<chrome binary> node design/tools/tour-clips/record.cjs <scratchDir> [create|qa|tasks|gantt|status]
//   python3 design/tools/tour-clips/cut.py <scratchDir> create qa tasks gantt status
// cut.py trims each recording between its two magenta marker flashes and writes
// src/assets/tour/<name>.mp4 and .webm (needs ffmpeg with libx264 and libvpx-vp9,
// and numpy). Clips are ~10s each, silent, 1100x733.
const L=require('./rec-lib.cjs'), fs=require('fs'), path=require('path')
const OUT=process.argv[2]+'/vid', M='.modal-overlay '
const which=process.argv[3]
const clips={
async create(r){const {p}=r
 await p.goto('http://localhost:5183/dashboard',{waitUntil:'networkidle'}); await r.wait(1000); await p.mouse.move(760,420)
 await r.flash(); await r.wait(400)
 await r.step({anchor:'bottom',place:'below',align:'end',text:'Start a project in four short steps',hold:1.9},'text=+ New project'); await r.wait(500)
 await r.step({anchor:'bottom',place:'below',align:'end',text:'Pick Waterfall, Agile or Hybrid',hold:1.9},M+'button:has-text("Hybrid")')
 await r.go(M+'button:has-text("Next")',{steps:18,pause:80}); await r.wait(300)
 await r.go(M+'input[type=text] >> nth=0',{steps:20,pause:80}); await p.keyboard.type('Office Relocation',{delay:28})
 await r.go(M+'input[type=text] >> nth=1',{steps:12,pause:80}); await p.keyboard.type('Move the team into the new HQ',{delay:20})
 await r.go(M+'button:has-text("Next")',{steps:18,pause:80}); await r.wait(300)
 await p.fill(M+'input[type=date]','2027-03-31')
 await r.step({anchor:'bottom',place:'below',align:'center',text:'Set a priority and go-live date',hold:1.9},M+'button:has-text("High")')
 await r.go(M+'button:has-text("Next")',{steps:15,pause:80}); await r.wait(300)
 await r.step({anchor:'bottom',place:'below',align:'start',text:'Guided setup drafts your Charter and Risk Log',hold:2.6},M+'button:has-text("Guided setup")')
 await r.go(M+'button:has-text("Create Project")',{click:false,steps:25,pause:100}); await r.wait(1100)
 await r.flash(); r.saveNotes('create')},
async qa(r){const {p}=r
 await p.goto('http://localhost:5183/dashboard',{waitUntil:'networkidle'}); await r.wait(800)
 await p.click('text=+ New project'); await r.wait(300)
 await p.click(M+'button:has-text("Hybrid")'); await p.click(M+'button:has-text("Next")'); await r.wait(250)
 const ts=await p.$$(M+'input[type=text], '+M+'textarea'); await ts[0].fill('Office Relocation'); if(ts[1]) await ts[1].fill('Move the team into the new HQ with no lost work.')
 await p.click(M+'button:has-text("Next")'); await r.wait(250)
 await p.click(M+'button:has-text("High")'); await p.fill(M+'input[type=date]','2027-03-31'); await p.click(M+'button:has-text("Next")'); await r.wait(250)
 await p.click(M+'button:has-text("Guided setup")'); await p.click(M+'button:has-text("Create Project")'); await r.wait(1500)
 await p.evaluate(()=>{for(const e of document.querySelectorAll('.modal-overlay *')){if(e.children.length===0&&/^(Step \d+ of \d+|Stage \d+ of \d+|Question \d+ of \d+)/.test(e.textContent.trim()))e.style.display='none'}})
 await p.mouse.move(700,560)
 await r.flash(); await r.wait(400)
 await r.note({target:M+'.qa-question-text, '+M+'h2, '+M+'h3',anchor:'right',place:'right',text:'One question per screen',hold:1.9}); await r.wait(1900)
 await r.note({target:M+'.qa-progress',anchor:'left',place:'left',align:'center',text:'See your progress',hold:1.9}); await r.wait(1900)
 await r.go(M+'textarea',{pause:200})
 await r.note({target:M+'textarea',anchor:'bottom',place:'below',align:'center',text:'Answer in your own words',hold:2.8})
 await p.keyboard.type('Everyone moves into the new HQ by 31 March with no lost working days.',{delay:34}); await r.wait(500)
 await r.go(M+'button:has-text("Next")',{pause:200}); await r.wait(1500)
 await r.flash(); r.saveNotes('qa')},
async tasks(r){const {p}=r
 await p.goto('http://localhost:5183/projects/p-wms/planning/tasks',{waitUntil:'networkidle'}); await r.wait(1500); await p.mouse.move(700,500)
 await r.flash(); await r.wait(400)
 await r.step({anchor:'bottom',place:'below',align:'start',text:'The assistant drafts tasks from your Charter',hold:2.4},'button:has-text("Generate More Tasks from Charter")',{click:false,steps:40})
 await r.step({anchor:'top',place:'above',align:'center',text:'Filter by status',hold:1.8},'button:has-text("In Progress")'); await r.wait(500)
 await r.go('button:has-text("All")',{steps:20,pause:200}); await r.wait(300)
 await p.mouse.move(600,520,{steps:20})
 for(let i=0;i<9;i++){await p.mouse.wheel(0,60); await r.wait(120)}
 await r.wait(300)
 await r.note({target:'text=Confirm requirements with each centre >> nth=0',anchor:'bottom',place:'below',align:'start',text:'You accept or edit every task',hold:2.4})
 await p.mouse.move(520,430,{steps:40}); await r.wait(2400)
 await r.flash(); r.saveNotes('tasks')},
async gantt(r){const {p}=r
 await p.goto('http://localhost:5183/projects/p-wms/execution/gantt',{waitUntil:'networkidle'}); await r.wait(1500); await p.mouse.move(700,450)
 await r.flash(); await r.wait(400)
 await r.step({anchor:'bottom',place:'below',align:'start',text:'Switch on the critical path',hold:2.0},'input[type=checkbox] >> nth=0',{steps:40}); await r.wait(900)
 await r.go('text=Initiation Phase',{steps:30,pause:150}); await r.wait(300)
 await r.go('text=Planning Phase',{steps:20,pause:150}); await r.wait(400)
 await r.step({anchor:'bottom',place:'below',align:'center',text:'Critical path in amber, with dependencies',hold:2.6},'.gantt-bar.critical-path:visible >> nth=0',{click:false,steps:35}); await r.wait(300)
 await r.step({anchor:'bottom',place:'below',align:'end',text:'Jump to today',hold:1.6},'button:has-text("Today")',{steps:35}); await r.wait(1000)
 await r.flash(); r.saveNotes('gantt')},
async status(r){const {p}=r
 await p.goto('http://localhost:5183/projects/p-wms/communications/status-update',{waitUntil:'networkidle'}); await r.wait(1500); await p.mouse.move(700,420)
 await r.flash(); await r.wait(400)
 await r.step({anchor:'right',place:'right',text:'A weekly update in three boxes',hold:1.9},'text=+ Log Status Update',{steps:40}); await r.wait(500)
 await r.go('textarea >> nth=0',{steps:20,pause:100})
 await r.note({target:'textarea >> nth=0',anchor:'bottom',place:'below',align:'end',text:'What got done, what is blocked, what is next',hold:3.4})
 await p.keyboard.type('Item master data migration 60% loaded.',{delay:26})
 await r.go('textarea >> nth=1',{steps:12,pause:100}); await p.keyboard.type('Nothing blocked.',{delay:30})
 await r.go('textarea >> nth=2',{steps:12,pause:100}); await p.keyboard.type('ERP integration testing and staff training.',{delay:26})
 await r.wait(400)
 await r.go('button:has-text("Log Status Update")',{steps:25,pause:150}); await r.wait(700)
 await r.note({target:'text=Show 1 earlier update',anchor:'top',place:'above',align:'start',text:'Every update is kept in history',hold:2.0}); await r.wait(2100)
 await r.flash(); r.saveNotes('status')}
}
;(async()=>{
 for(const name of (which?[which]:Object.keys(clips))){
  const dir=path.join(OUT,name); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true})
  const r=await L.open(dir)
  try{await clips[name](r)}catch(e){console.log(name,'FAILED',e.message.split('\n')[0])}
  const f=await r.close(); console.log(name,f)
 }
})()
