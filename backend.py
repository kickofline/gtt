import os
import sqlite3
import time
from contextlib import contextmanager
from flask import Flask, request, jsonify, send_file, abort

DB_PATH = os.environ.get("DB_PATH", "checkins.db")

app = Flask(__name__)


@contextmanager
def get_db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with get_db() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
        """)


init_db()


@app.route('/')
def index():
    return send_file('barcode-checkin.html')


@app.post('/checkin')
def checkin():
    body = request.get_json(force=True) or {}
    sid = (body.get('student_id') or '').strip()
    if not sid:
        abort(400, description='student_id is required')

    with get_db() as con:
        rows = con.execute(
            'SELECT timestamp FROM checkins WHERE student_id = ? ORDER BY timestamp ASC',
            (sid,)
        ).fetchall()

        if len(rows) >= 3:
            return jsonify({
                'student_id': sid,
                'scans': [r['timestamp'] for r in rows],
                'status': 'already_complete',
                'message': f'{sid} has already completed all 3 check-ins.'
            })

        ts = int(time.time() * 1000)
        con.execute(
            'INSERT INTO checkins (student_id, timestamp) VALUES (?, ?)',
            (sid, ts)
        )

        updated = con.execute(
            'SELECT timestamp FROM checkins WHERE student_id = ? ORDER BY timestamp ASC',
            (sid,)
        ).fetchall()
        scans = [r['timestamp'] for r in updated]

    return jsonify({
        'student_id': sid,
        'scans': scans,
        'status': 'complete' if len(scans) >= 3 else 'partial',
        'message': f'{sid} — Check-in {len(scans)}/3 recorded.' + (' All done!' if len(scans) == 3 else '')
    })


@app.get('/records')
def get_records():
    with get_db() as con:
        rows = con.execute(
            'SELECT student_id, timestamp FROM checkins ORDER BY student_id, timestamp ASC'
        ).fetchall()

    records = {}
    for row in rows:
        sid = row['student_id']
        if sid not in records:
            records[sid] = []
        records[sid].append(row['timestamp'])

    return jsonify({'records': records})


@app.delete('/records/<student_id>')
def delete_student(student_id):
    with get_db() as con:
        con.execute('DELETE FROM checkins WHERE student_id = ?', (student_id,))
    return jsonify({'deleted': student_id})


@app.delete('/records')
def clear_all():
    with get_db() as con:
        con.execute('DELETE FROM checkins')
    return jsonify({'message': 'All records cleared.'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
