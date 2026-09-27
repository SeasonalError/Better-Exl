"""Immutable SQLite revisions with optimistic concurrency protection."""
import json
import sqlite3
from pathlib import Path
from datetime import datetime,timezone
from .engine import validate_sheet
from .templates import uid
def now():return datetime.now(timezone.utc).isoformat(timespec='seconds')
class Conflict(ValueError):pass
def validate_project(p):
    if not isinstance(p,dict) or not isinstance(p.get('name'),str) or not p['name'].strip() or len(p['name'])>200:raise ValueError('Use an experiment name of 1–200 characters.')
    if p.get('formatVersion',1)!=1:raise ValueError('Unsupported project format version. Use a compatible Better Exl release.')
    if not isinstance(p.get('sheets'),list) or not 1<=len(p['sheets'])<=30:raise ValueError('An experiment needs 1–30 datasets.')
    ids=set()
    for s in p['sheets']:
        validate_sheet(s)
        if not s.get('id') or s['id'] in ids:raise ValueError('Dataset IDs must be unique.')
        ids.add(s['id'])
class Store:
    def __init__(self,path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as db:db.executescript('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT,updated TEXT,version INTEGER,body TEXT); CREATE TABLE IF NOT EXISTS revisions(project_id TEXT,version INTEGER,created TEXT,body TEXT,PRIMARY KEY(project_id,version));')
    def connect(self):db=sqlite3.connect(self.path,timeout=15);db.row_factory=sqlite3.Row;return db
    def list(self):
        with self.connect() as db:return [dict(r) for r in db.execute('SELECT id,name,updated,version FROM projects ORDER BY updated DESC')]
    def get(self,id,version=None):
        with self.connect() as db:r=db.execute('SELECT body FROM projects WHERE id=?',(id,)).fetchone() if version is None else db.execute('SELECT body FROM revisions WHERE project_id=? AND version=?',(id,version)).fetchone()
        if not r:raise KeyError('Experiment or revision not found.')
        return json.loads(r[0])
    def create(self,p):return self.save({**p,'id':uid(),'version':0,'created':now()},True)
    def save(self,p,new=False):
        validate_project(p)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE');r=db.execute('SELECT version FROM projects WHERE id=?',(p['id'],)).fetchone()
            if not new and not r:raise KeyError('Experiment not found.')
            if not new and r[0]!=p.get('version'):raise Conflict('A newer version exists, possibly from another tab. Export a backup of these edits, then reload. Nothing was overwritten.')
            p={**p,'version':p.get('version',0)+1,'updated':now(),'formatVersion':1};body=json.dumps(p,ensure_ascii=False,allow_nan=False)
            db.execute('INSERT OR REPLACE INTO projects VALUES(?,?,?,?,?)',(p['id'],p['name'],p['updated'],p['version'],body));db.execute('INSERT INTO revisions VALUES(?,?,?,?)',(p['id'],p['version'],p['updated'],body))
        return p
    def revisions(self,id):
        with self.connect() as db:return [dict(r) for r in db.execute('SELECT version,created FROM revisions WHERE project_id=? ORDER BY version DESC LIMIT 200',(id,))]
