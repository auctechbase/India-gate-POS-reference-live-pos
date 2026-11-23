import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalHeader, ModalBody, ModalFooter, FormGroup } from 'reactstrap';

// Choose which printer receipts and barcode labels go to. Without a choice the POS prints on
// the Windows default printer, as before. Kept by the desktop app (printers.json in its data folder).
const KINDS = [
    { kind: 'receipt', label: 'Receipt printer', hint: 'Receipts, website order slips, reports and the cash drawer.' },
    { kind: 'label', label: 'Label printer', hint: 'Barcode labels.' },
];

export default function PrinterSettings({ isOpen, onClose }) {
    const api = window.electronAPI;
    const [printers, setPrinters] = useState([]);
    const [choice, setChoice] = useState({ receipt: '', label: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !api?.getPrinterChoice) return;
        let cancelled = false;
        Promise.all([api.getPrinters(), api.getPrinterChoice()])
            .then(([list, saved]) => {
                if (cancelled) return;
                setPrinters(Array.isArray(list) ? list : []);
                setChoice({ receipt: saved?.receipt || '', label: saved?.label || '' });
            })
            .catch(() => toast.error('Could not read the printers.'));
        return () => { cancelled = true; };
    }, [isOpen, api]);

    const defaultName = printers.find(p => p.isDefault)?.name;

    const save = async () => {
        setSaving(true);
        try {
            await api.setPrinterChoice(choice);
            toast.success('Printers saved');
            onClose();
        } catch (error) {
            toast.error('Could not save the printers.');
        } finally {
            setSaving(false);
        }
    };

    const testPrint = async (kind) => {
        try {
            await api.setPrinterChoice(choice); // test what is selected now
            api.testPrint(kind);
            toast.success('Test sent to the printer');
        } catch (error) {
            toast.error('Could not send the test print.');
        }
    };

    return (
        <Modal isOpen={isOpen} toggle={onClose} size="lg">
            <ModalHeader toggle={onClose}>Printers</ModalHeader>
            <ModalBody>
                { !api?.getPrinterChoice ? (
                    <p className="mb-0">Printers can only be chosen in the POS app on the till.</p>
                ) : KINDS.map(({ kind, label, hint }) => {
                    const missing = choice[kind] && printers.length > 0 && !printers.some(p => p.name === choice[kind]);
                    return (
                        <FormGroup key={kind} className="mb-4">
                            <label className="fw-bold fs-5 mb-1" htmlFor={`printer-${kind}`}>{label}</label>
                            <div className="text-muted mb-2">{hint}</div>
                            <div className="d-flex gap-2">
                                <select id={`printer-${kind}`} className="form-select form-control-lg"
                                    value={choice[kind]}
                                    onChange={e => setChoice({ ...choice, [kind]: e.target.value })}>
                                    <option value="">Windows default printer{defaultName ? ` (${defaultName})` : ''}</option>
                                    {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                                    {missing && <option value={choice[kind]}>{choice[kind]} (not installed)</option>}
                                </select>
                                <button type="button" className="btn btn-light text-nowrap" onClick={() => testPrint(kind)}>
                                    <i className="mdi mdi-printer me-1" />Test print
                                </button>
                            </div>
                            {missing && <small className="text-danger">This printer is not installed: the default printer is used until you choose another.</small>}
                        </FormGroup>
                    );
                })}
            </ModalBody>
            <ModalFooter>
                <button type="button" className="btn btn-light btn-rounded" onClick={onClose}>Close</button>
                { api?.getPrinterChoice &&
                    <button type="button" className="btn btn-success btn-rounded" disabled={saving} onClick={save}>Save</button> }
            </ModalFooter>
        </Modal>
    );
}
