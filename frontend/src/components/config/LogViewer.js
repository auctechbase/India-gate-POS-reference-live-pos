import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';
import { BACKEND_URL } from '../../config';

// Configuration → Logs: what the POS wrote to its log (prints, payments, website sync, errors),
// newest first, and a button that saves the last week as one file to send for support.
export default function LogViewer({ isOpen, onClose }) {
    const [lines, setLines] = useState([]);
    const [folder, setFolder] = useState('');
    const [onlyProblems, setOnlyProblems] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        axios.get('logs/recent?days=3')
            .then(({ data }) => { setLines((data.lines || []).slice().reverse()); setFolder(data.folder || ''); })
            .catch(() => toast.error('Could not read the log.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

    const save = async () => {
        try {
            if (window.electronAPI?.exportLogs) {
                const file = await window.electronAPI.exportLogs();
                toast.success(`Saved on the Desktop: ${file.split(/[\\/]/).pop()}`, { duration: 6000 });
            } else {
                // Plain browser: download it (the request needs the login header).
                const res = await fetch(`${BACKEND_URL}logs/export`, { headers: { 'pos-token': localStorage.getItem('pos-token') || '' } });
                if (!res.ok) throw new Error(String(res.status));
                const url = URL.createObjectURL(await res.blob());
                const a = Object.assign(document.createElement('a'), { href: url, download: `india-gate-pos-log-${new Date().toISOString().slice(0, 10)}.txt` });
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            toast.error('Could not save the log.');
        }
    };

    const shown = onlyProblems ? lines.filter(l => / (ERROR|WARN) /.test(l)) : lines;
    const tone = (line) => / ERROR /.test(line) ? '#b91c1c' : / WARN /.test(line) ? '#b45309' : '#1f2328';

    return (
        <Modal isOpen={isOpen} toggle={onClose} size="xl">
            <ModalHeader toggle={onClose}>Logs</ModalHeader>
            <ModalBody>
                <div className="d-flex align-items-center gap-3 mb-2 flex-wrap">
                    <label className="d-flex align-items-center gap-2 mb-0" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} style={{ width: 20, height: 20 }} />
                        Only problems
                    </label>
                    <button type="button" className="btn btn-light btn-sm" onClick={load} disabled={loading}>
                        <i className="mdi mdi-refresh me-1" />Refresh
                    </button>
                    <small className="text-muted ms-auto" style={{ fontSize: '0.8rem' }}>Last 3 days, newest first · {folder}</small>
                </div>
                <pre style={{ height: '42vh', overflow: 'auto', background: '#f6f8fa', border: '1px solid #d0d7de', borderRadius: 8, padding: 12, fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {shown.length === 0
                        ? (loading ? 'Loading…' : (onlyProblems ? 'No problems logged.' : 'Nothing logged yet.'))
                        : shown.map((line, i) => <div key={i} style={{ color: tone(line) }}>{line}</div>)}
                </pre>
            </ModalBody>
            <ModalFooter>
                <button type="button" className="btn btn-light btn-rounded" onClick={onClose}>Close</button>
                <button type="button" className="btn btn-success btn-rounded" onClick={save}>
                    <i className="mdi mdi-content-save me-1" />Save logs
                </button>
            </ModalFooter>
        </Modal>
    );
}
