import React, { useEffect, useState } from 'react';
import { BACKEND_URL } from '../../config';
import TouchKeyboard from '../common/TouchKeyboard';
import toast from 'react-hot-toast';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { Container, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';
import { useGetNotesQuery } from '../../features/centerSlice';

export default function Notes() {
    const [fields, setFields] = useState({})
    const dispatch = useDispatch();

    const {currency, hasKeyboard} = useSelector( state => state.auth )
    const [notes, setNotes] = useState([]);
    const [open, setModal] = useState(false);
    const [image, setImage] = useState(null);
    const {data, isSuccess} = useGetNotesQuery();

    const toggleModal = () => {
        setFocused(null)
        setModal(!open)
    }

    const change = e => setFields({...fields, [e.target.name]: e.target.value })

    const deleteNote = (id) => {

        if(!window.confirm('Are you sure?')) return;

        dispatch({type:"LOADING"});

        axios.get(`/notes/remove/${id}`).then(({data})=> {
            if(data.status) {
                setNotes(notes.filter(item => item.id!== id));
            } else {
                toast.error("Something went wrong!");
            }
        }).catch(err => {})
        .finally(()=> dispatch({type:"STOP_LOADING"}));
        
    }

    const createNote = e => {
        e.preventDefault();
        setFocused(null);
        if(fields.amount % 5 !== 0) return toast.error("Amount not valid!")
        if(!image) return toast.error("Choose an image!");
        let fd = new FormData();
        fd.append('image', image);
        fd.append('amount', (fields.amount - 0));
        if(notes.some( n => parseInt(n.amount) === parseInt(fields.amount))) {
            return toast.error(`${parseInt(fields.amount)} note is already added!`);
        }
        dispatch({ type:"LOADING" });

        axios.post(`/notes/create`, fd , {
            headers: {
                'Accept': 'application/json',
                "Content-Type" : "multipart/form-data",
                'pos-token' : localStorage.getItem('pos-token')
            }
        }).then(({data}) => {
            if(data.status) {
                toast.success("Note added!");
                toggleModal()
            }
            setNotes([...notes, data.note])
        }).catch( er => {
            if(er.response?.data?.error) {
                return toast.error(er.response.data.error)
            }
            toast.error(er.response?.responseText?? 'Something went wrong!')
        } )
        .finally(() => dispatch({ type: "STOP_LOADING" }) )
    }
    
    useEffect(() => {
        if(isSuccess) {
            setNotes(data.notes)
        }
    },[data, isSuccess])


    const [ focused, setFocused ] = useState('');

    
    return (
        <>
            <div className="content-wrapper">
                <div className="d-grid mt-3" >
                    <div id="category">
                        <div className="col-lg-12 grid-margin stretch-card">
                            <div className="card">
                                <div className="card-header">
                                    <button className="btn btn-sm btn-success" onClick={toggleModal}> Add New</button>
                                </div>
                                <div className="card-body">
                                    <div className="table-responsive w-100 categoryTable">
                                        <table className='table table-bordered' style={{borderRadius:10}}>
                                            <thead>
                                                <tr>
                                                    <th>S.No</th>
                                                    <th>Amount</th>
                                                    <th>Image</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {notes.map( (item,i) => (
                                                    <tr key={item.id}>
                                                        <td>{++i}</td>
                                                        <td> {currency} {item.amount} </td>
                                                        <td><img src={BACKEND_URL+'images/'+item.image} style={{ borderRadius:0,height:60, width:100 }} alt='' /></td>
                                                        <td>
                                                            <button className={`btn btn-danger btn-sm`} onClick={()=>deleteNote(item.id)} >
                                                                Delete
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <Modal isOpen={open} toggle={toggleModal} > 
                <Form onSubmit={createNote} >
                    <ModalHeader > Update Product </ModalHeader>
                        <ModalBody>
                            <Container>
                                <Row>
                                    <FormGroup>
                                        <Label> Amount </Label>
                                        <Input
                                            type={'number'}
                                            name='amount'
                                            onClick={()=> setFocused('amount')}
                                            onChange={change}
                                            value={fields.amount}
                                        />
                                    </FormGroup>
                                </Row>
                                <Row>
                                    <FormGroup>
                                        <Label> Image </Label>
                                        <Input 
                                            type='file'
                                            accept='image/*'
                                            onChange={e => {setFocused(null);setImage(e.target.files[0])}}
                                        />
                                    </FormGroup>
                                </Row> 
                            </Container>
                        </ModalBody>
                    <ModalFooter>
                        <button className="btn btn-light btn-rounded" type="button" onClick={toggleModal}>
                            Close
                        </button>
                        <button className="btn btn-success btn-rounded" type="submit" >
                            Upload
                        </button>
                    </ModalFooter> 
                </Form>
            </Modal>
            {focused && !hasKeyboard && <TouchKeyboard
                open
                value={fields.amount}
                onChange={amount => setFields({...fields, amount})}
                layout="integer"
                label="Note amount"
                onClose={() => setFocused('')}
            />}
        </>
    )
}
