const express = require("express");
const cors = require("cors");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const app = express();
const db = new sqlite3.Database("./database.db");

app.use(express.json());
app.use(express.static("public"));

app.use(cors());

app.use(session({
    secret: "bratva_secret",
    resave: true,
    saveUninitialized: true
}));

// ---------- DB ----------
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        password TEXT,
        role TEXT,
        cnp TEXT
    )`);
    db.run(`ALTER TABLE users ADD COLUMN cnp TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN org TEXT DEFAULT 'bratva'`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS bratva (
        id INTEGER PRIMARY KEY,
        nume TEXT, cnp TEXT, telefon TEXT,
        masca INTEGER, bandana INTEGER, manusa INTEGER, sindicat INTEGER, grad TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sputnik (
        id INTEGER PRIMARY KEY,
        nume TEXT, cnp TEXT, telefon TEXT, grad TEXT,
        task TEXT, taskAvansari TEXT, invoire TEXT, prezenta TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, description TEXT,
        priority TEXT DEFAULT 'normal',
        assignedTo TEXT DEFAULT 'all',
        faction TEXT DEFAULT 'all',
        status TEXT DEFAULT 'activ',
        deadline TEXT DEFAULT NULL,
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`ALTER TABLE tasks ADD COLUMN deadline TEXT DEFAULT NULL`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        taskId INTEGER,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS invoiri (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        username TEXT,
        cnp TEXT,
        nume TEXT,
        startDate TEXT NOT NULL,
        durataZile INTEGER NOT NULL,
        endDate TEXT NOT NULL,
        motiv TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS service (
        id INTEGER PRIMARY KEY,
        nume TEXT, grad TEXT, pontaj TEXT
    )`);
});

// ---------- AUTO-EXPIRY ----------
function checkExpiredTasks() {
    const now = new Date().toISOString().replace('T',' ').substring(0,19);
    db.all(`SELECT * FROM tasks WHERE status='activ' AND deadline IS NOT NULL AND deadline!='' AND deadline<=?`, [now], (err,rows)=>{
    db.run(`ALTER TABLE service ADD COLUMN cnp TEXT`, () => {});
    db.run(`ALTER TABLE invoiri ADD COLUMN org TEXT DEFAULT 'bratva'`, () => {});    
        if(err||!rows||!rows.length) return;
        rows.forEach(task=>{
            db.run(`UPDATE tasks SET status='expirat' WHERE id=?`, [task.id]);
            if(task.assignedTo && task.assignedTo!=='all'){
                db.get(`SELECT id FROM users WHERE username=?`, [task.assignedTo], (err,u)=>{
                    if(u) db.run(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`,
                        [u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`]);
                });
            } else {
                db.all(`SELECT id FROM users`, (err,users)=>{
                    if(!users) return;
                    users.forEach(u=>db.run(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`,
                        [u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`]));
                });
            }
        });
    });
}
setInterval(checkExpiredTasks, 60*1000);
setTimeout(checkExpiredTasks, 2000);

// ---------- AUTH ----------
function requireAuth(req,res,next){ if(!req.session.user) return res.status(401).send("Login necesar"); next(); }
function requireRole(role){ return (req,res,next)=>{ if(!req.session.user) return res.status(401).send("Login"); if(req.session.user.role.toLowerCase()!==role.toLowerCase()) return res.status(403).send("Interzis"); next(); }; }

app.post("/login",(req,res)=>{
const {username,password,org}=req.body;
    db.get("SELECT * FROM users WHERE username=?",[username],async(err,user)=>{
        if(!user) return res.status(401).send("User invalid");
        const ok=await bcrypt.compare(password,user.password);
        if(!ok) return res.status(401).send("Parolă greșită");
        const userOrg=(user.org||'bratva').toLowerCase();
        // 'admin' is universal; for everyone else, org must match the login origin
        if(org && username!=='admin'){
            if(userOrg!==org.toLowerCase()) return res.status(403).send("Cont nepermis pentru această secțiune");
        }
        // For admin, adopt the org of the login surface so views are scoped properly
        if(username==='admin' && org) user.org = org.toLowerCase();
        else user.org = userOrg;
        req.session.user=user; res.send("OK");
    });
});
app.get("/me",(req,res)=>{ res.json(req.session.user||null); });
app.post("/logout",(req,res)=>{ req.session.destroy(); res.send("OK"); });
app.post("/register",async(req,res)=>{
    const {username,password,cnp,org}=req.body;
    const orgVal=(org||'bratva').toLowerCase()==='service'?'service':'bratva';
    if(!username||!password) return res.status(400).send("Date incomplete");
    if(password.length<6) return res.status(400).send("Parola prea scurta");
    if(!cnp||cnp.trim()==='') return res.status(400).send("CNP-ul este obligatoriu");
     // Verify CNP exists in the relevant org tables
    const lookupSql = orgVal==='service'
        ? `SELECT nume FROM service WHERE cnp=? LIMIT 1`
        : `SELECT nume FROM bratva WHERE cnp=? UNION SELECT nume FROM sputnik WHERE cnp=? LIMIT 1`;
    const lookupParams = orgVal==='service' ? [cnp.trim()] : [cnp.trim(),cnp.trim()];
    db.get(lookupSql,lookupParams,async(err,member)=>{
        if(!member) return res.status(403).send("CNP-ul nu este înregistrat în organizație");
        db.get("SELECT id FROM users WHERE username=?",[username],async(err,existing)=>{
            if(existing) return res.status(409).send("Username deja folosit");
            db.get("SELECT id FROM users WHERE cnp=?",[cnp.trim()],async(err2,existingCnp)=>{
                if(existingCnp) return res.status(409).send("CNP deja înregistrat");
                const hash=await bcrypt.hash(password,10);
                db.run("INSERT INTO users (username,password,role,cnp,org) VALUES (?,?,?,?,?)",[username,hash,"member",cnp.trim(),orgVal],function(err){
                    if(err) return res.status(500).send("Eroare DB"); res.send("OK");
                });
            });
        });
    });
});

// ---------- BRATVA ----------
app.get("/bratva",requireAuth,(req,res)=>{
    db.all("SELECT * FROM bratva",(err,rows)=>{
        if(!rows) return res.json([]);
        const today = new Date().toISOString().substring(0,10);
        db.all(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`,[today,today],(e,act)=>{
            const set = new Set((act||[]).map(r=>(r.cnp||'').trim()).filter(Boolean));
            rows.forEach(r=>{ r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
            res.json(rows);
        });
    });
});
app.post("/bratva",requireRole("leader"),(req,res)=>{
    db.run("DELETE FROM bratva");
    const stmt=db.prepare(`INSERT INTO bratva (nume,cnp,telefon,masca,bandana,manusa,sindicat,grad) VALUES (?,?,?,?,?,?,?,?)`);
    req.body.forEach(d=>stmt.run(d.nume,d.cnp,d.telefon,d.masca?1:0,d.bandana?1:0,d.manusa?1:0,d.sindicat?1:0,d.grad));
    stmt.finalize(); res.send("Saved");
});

// ---------- SPUTNIK ----------
app.get("/sputnik",requireAuth,(req,res)=>{
    db.all("SELECT * FROM sputnik",(err,rows)=>{
        if(!rows) return res.json([]);
        const today = new Date().toISOString().substring(0,10);
        db.all(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`,[today,today],(e,act)=>{
            const set = new Set((act||[]).map(r=>(r.cnp||'').trim()).filter(Boolean));
            rows.forEach(r=>{ r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
            res.json(rows);
        });
    });
});
app.post("/sputnik",requireRole("leader"),(req,res)=>{
    db.run("DELETE FROM sputnik");
    const stmt=db.prepare(`INSERT INTO sputnik (nume,cnp,telefon,grad,task,taskAvansari,invoire,prezenta) VALUES (?,?,?,?,?,?,?,?)`);
    req.body.forEach(d=>stmt.run(d.nume,d.cnp,d.telefon,d.grad,d.task,d.taskAvansari,d.invoire,d.prezenta));
    stmt.finalize(); res.send("Saved");
});

// ---------- SERVICE ----------
app.get("/service",requireAuth,(req,res)=>{
    db.all("SELECT * FROM service",(err,rows)=>{
        if(!rows) return res.json([]);
        const today=new Date().toISOString().substring(0,10);
        db.all(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`,[today,today],(e,act)=>{
            const set=new Set((act||[]).map(r=>(r.cnp||'').trim()).filter(Boolean));
            rows.forEach(r=>{ r.invoire=(r.cnp && set.has(r.cnp.trim()))?"Da":"Nu"; });
            res.json(rows);
        });
    });
});
app.post("/service",requireRole("leader"),(req,res)=>{
    db.run("DELETE FROM service");
    const stmt=db.prepare(`INSERT INTO service (nume,cnp,grad,pontaj) VALUES (?,?,?,?)`);
    req.body.forEach(d=>stmt.run(d.nume,d.cnp,d.grad,d.pontaj));
    stmt.finalize(); res.send("Saved");
});

// ---------- TASKS ----------
app.get("/tasks",requireAuth,(req,res)=>{ db.all("SELECT * FROM tasks ORDER BY createdAt DESC",(err,rows)=>{ res.json(rows||[]); }); });
// Returns the CNP-matched member name for the current user (used by frontend to filter tasks)
app.get("/my-member-name",requireAuth,(req,res)=>{
    const cnp = req.session.user.cnp;
    if(!cnp) return res.json({names:[]});
    db.all(`SELECT nume FROM bratva WHERE cnp=? UNION SELECT nume FROM sputnik WHERE cnp=?`,[cnp,cnp],(err,rows)=>{
        res.json({names: rows ? rows.map(r=>r.nume).filter(Boolean) : []});
    });
});
app.get("/members",requireAuth,(req,res)=>{
    db.all("SELECT nume,'Bratva' as faction FROM bratva WHERE nume IS NOT NULL AND nume!='' UNION ALL SELECT nume,'Sputnik' as faction FROM sputnik WHERE nume IS NOT NULL AND nume!='' ORDER BY faction,nume",(err,rows)=>{ res.json(rows||[]); });
});
app.post("/tasks",requireRole("leader"),(req,res)=>{
    const {title,description,priority,assignedTo,faction,deadline}=req.body;
    if(!title) return res.status(400).send("Titlul este obligatoriu");
    const now=new Date().toISOString().replace('T',' ').substring(0,19);
    let deadlineVal=null;
    if(deadline&&deadline.trim()!=='') deadlineVal=deadline.replace('T',' ')+':00';
    db.run(`INSERT INTO tasks (title,description,priority,assignedTo,faction,status,deadline,createdAt) VALUES (?,?,?,?,?,'activ',?,?)`,
        [title,description||"",priority||"normal",assignedTo||"all",faction||"all",deadlineVal,now],
        function(err){
            if(err){ console.error(err); return res.status(500).send('Eroare DB'); }
            const taskId=this.lastID;
            const assigned=assignedTo||'all';
            if(assigned!=='all'){
                db.get(`SELECT id FROM users WHERE username=?`,[assigned],(err,u)=>{
                    if(u) db.run(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`,
                        [u.id,taskId,`📋 Ai primit un task nou: "${title}"`]);
                });
            } else {
                db.all(`SELECT id FROM users`,(err,users)=>{
                    if(!users) return;
                    users.forEach(u=>db.run(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`,
                        [u.id,taskId,`📋 Task nou pentru toți: "${title}"`]));
                });
            }
            res.json({id:taskId});
        }
    );
});
app.patch("/tasks/:id",requireAuth,(req,res)=>{
    const{status}=req.body;
    db.run("UPDATE tasks SET status=? WHERE id=?",[status,req.params.id],(err)=>{ if(err) return res.status(500).send("Eroare DB"); res.send("OK"); });
});
app.delete("/tasks/:id",requireRole("leader"),(req,res)=>{
    db.run("DELETE FROM tasks WHERE id=?",[req.params.id],(err)=>{ if(err) return res.status(500).send("Eroare DB"); res.send("OK"); });
});

// ---------- NOTIFICATIONS ----------
app.get("/notifications/count",requireAuth,(req,res)=>{
    db.get(`SELECT COUNT(*) as count FROM notifications WHERE userId=? AND read=0`,[req.session.user.id],(err,row)=>{ res.json({count:row?row.count:0}); });
});
app.get("/notifications",requireAuth,(req,res)=>{
    db.all(`SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT 30`,[req.session.user.id],(err,rows)=>{ res.json(rows||[]); });
});
app.patch("/notifications/:id/read",requireAuth,(req,res)=>{
    db.run(`UPDATE notifications SET read=1 WHERE id=? AND userId=?`,[req.params.id,req.session.user.id],(err)=>{ if(err) return res.status(500).send("Eroare"); res.send("OK"); });
});
app.post("/notifications/read-all",requireAuth,(req,res)=>{
    db.run(`UPDATE notifications SET read=1 WHERE userId=?`,[req.session.user.id],(err)=>{ if(err) return res.status(500).send("Eroare"); res.send("OK"); });
});

// ---------- ADMIN ----------
app.get("/admin/users",requireRole("leader"),(req,res)=>{ db.all("SELECT id,username,role,cnp FROM users ORDER BY id ASC",(err,rows)=>{ res.json(rows||[]); }); });
app.patch("/admin/users/:id/role",requireRole("leader"),(req,res)=>{
    const{role}=req.body;
    if(!["leader","member"].includes((role||"").toLowerCase())) return res.status(400).send("Rol invalid");
    if(parseInt(req.params.id)===req.session.user.id) return res.status(403).send("Nu îți poți schimba propriul rol");
    db.run("UPDATE users SET role=? WHERE id=?",[role.toLowerCase(),req.params.id],(err)=>{ if(err) return res.status(500).send("Eroare DB"); res.send("OK"); });
});
app.delete("/admin/users/:id",requireRole("leader"),(req,res)=>{
    if(parseInt(req.params.id)===req.session.user.id) return res.status(403).send("Nu te poți șterge pe tine însuți");
    db.run("DELETE FROM users WHERE id=?",[req.params.id],(err)=>{ if(err) return res.status(500).send("Eroare DB"); res.send("OK"); });
});

// ---------- INVOIRI ----------
function addDays(dateStr,days){
    const d=new Date(dateStr+"T00:00:00");
    d.setDate(d.getDate()+parseInt(days,10));
    return d.toISOString().substring(0,10);
}
app.get("/invoiri",requireAuth,(req,res)=>{
        const userOrg=(req.session.user.org||'bratva').toLowerCase();
        db.all(`SELECT * FROM invoiri WHERE COALESCE(org,'bratva')=? ORDER BY startDate DESC, id DESC`,[userOrg],(err,rows)=>{
        const today=new Date().toISOString().substring(0,10);
        const list=(rows||[]).map(r=>({...r, activa:(r.startDate<=today && r.endDate>=today)?1:0}));
        res.json(list);
    });
});
app.post("/invoiri",requireAuth,(req,res)=>{
    const {startDate,durataZile,motiv}=req.body;
    if(!startDate || !durataZile) return res.status(400).send("Data și durata sunt obligatorii");
    const dz=parseInt(durataZile,10);
    if(isNaN(dz) || dz<1 || dz>365) return res.status(400).send("Durată invalidă");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).send("Dată invalidă");
    const u=req.session.user;
    const userOrg=(u.org||'bratva').toLowerCase();
    const endDate=addDays(startDate,dz);
    // Look up nume by CNP in the appropriate org tables
    const lookupSql = userOrg==='service'
        ? `SELECT nume FROM service WHERE cnp=? LIMIT 1`
        : `SELECT nume FROM bratva WHERE cnp=? UNION SELECT nume FROM sputnik WHERE cnp=? LIMIT 1`;
    const lookupParams = userOrg==='service' ? [u.cnp||''] : [u.cnp||'',u.cnp||''];
    db.get(lookupSql,lookupParams,(e,m)=>{
        const nume=m?m.nume:u.username;
        db.run(`INSERT INTO invoiri (userId,username,cnp,nume,startDate,durataZile,endDate,motiv,org) VALUES (?,?,?,?,?,?,?,?,?)`,
            [u.id,u.username,u.cnp||'',nume,startDate,dz,endDate,(motiv||'').trim(),userOrg],
            function(err){
                if(err){ console.error(err); return res.status(500).send("Eroare DB"); }
                // Notify all leaders within the same org (admin always notified)
                db.all(`SELECT id FROM users WHERE LOWER(role)='leader' AND (COALESCE(org,'bratva')=? OR username='admin')`,[userOrg],(e2,leaders)=>{
                    (leaders||[]).forEach(l=>db.run(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`,
                        [l.id,null,`📅 ${nume} a postat o învoire (${startDate} → ${endDate})`]));
                });
                res.json({id:this.lastID,endDate});
            }
        );
    });
});
app.delete("/invoiri/:id",requireAuth,(req,res)=>{
    const u=req.session.user;
    db.get(`SELECT * FROM invoiri WHERE id=?`,[req.params.id],(err,row)=>{
        if(!row) return res.status(404).send("Inexistent");
        if(row.userId!==u.id && u.role.toLowerCase()!=='leader') return res.status(403).send("Interzis");
        db.run(`DELETE FROM invoiri WHERE id=?`,[req.params.id],(e)=>{
            if(e) return res.status(500).send("Eroare DB");
            res.send("OK");
        });
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});