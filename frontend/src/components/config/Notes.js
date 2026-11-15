import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { Container, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';
import { useGetNotesQuery } from '../../features/centerSlice';
import Keyboard from 'react-simple-keyboard';

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
    const [position, setPosition] = useState({ x: window.screen.availWidth/4, y: window.screen.availHeight / 2 });
    const [dragging, setDragging] = useState(false);
    const [offset, setOffset] = useState({  x: 0, y: 0  });

    const handleMouseDown = (e) => {
        setDragging(true);
        setOffset({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;
        setPosition({
            x: e.clientX - offset.x,
            y: e.clientY - offset.y,
        });
    }
    const handleMouseUp = () => setDragging(false);
    const [ focused, setFocused ] = useState('');
    const [scale, setScale] = useState(localStorage.getItem('_keyboard_scale')??1); // Default scale (1 = 100%)
    const decrease = () => {
        localStorage.setItem('_keyboard_scale', Math.max(scale - 0.1, 0.5))
        setScale(prev => Math.max(prev - 0.1, 0.5))
    }
    const increase = () => {
        localStorage.setItem('_keyboard_scale', Math.min(JSON.parse(scale) + 0.1, 2))
        setScale(prev => Math.min(JSON.parse(prev) + 0.1, 2))
    }

    
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
                                                        <td><img src={process.env.REACT_APP_BACKEND_URI+'images/'+item.image} style={{ borderRadius:0,height:60, width:100 }} alt='' /></td>
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
            {focused && !hasKeyboard && <div className='mt-4 position-fixed w-50' style={{zIndex:9999, top:60 }}>
            <div
                style={{
                    overflow: "hidden",
                    position: "relative",
                    touchAction: "none",
                }}
                onMouseMove={handleMouseMove}
                onTouchMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
            >
                <div
                    style={{
                        position: "fixed",
                        top: `${position.y}px`,
                        left: `${position.x}px`,
                        cursor: dragging ? "grabbing" : "grab",
                        zIndex: 1000,
                        width:700,
                        resize:'both',
                        overflow:'auto',
                        touchAction: "none",
                        transform: `scale(${scale})`, transformOrigin: "top center"
                    }}
                >
                    <div
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleMouseDown}
                        style={{
                            background: "#444",
                            color: "#fff",
                            padding: 10,
                            cursor: "grab",
                            textAlign: "center",
                            borderRadius: "8px 8px 0 0",
                            touchAction: "none",
                        }}
                    >
                        Hold To Drag 
                    </div>
                        <Keyboard
                            onChange={e => setFields({...fields, amount:e})}
                            layout={{
                                default: [
                                    "1 2 3",
                                    "4 5 6",
                                    "7 8 9",
                                    "0  {bksp}",
                                ]
                            }}
                            display={{ 
                                "{bksp}":"x", 
                            }}
                        />
                    <div className='bg-white d-flex board-navs' style={{justifyContent:'space-between',padding:'5px 20px'}}>
                        <button className='btn btn-light btn-rounded' onClick={()=>setFields({...fields, amount:''})} style={{border:'1px solid gray'}}>CLEAR</button>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={decrease}>-</button>
                        <span> Size: {Math.round(scale * 100)}% </span>
                        <button style={{border:'1px solid'}} className='btn btn-light btn-rounded' onClick={increase}>+</button>
                        <button onClick={()=>setFocused(!focused)} className='btn btn-light btn-rounded' style={{border:'1px solid gray'}}>HIDE</button>
                    </div>
                </div>
            </div>
        </div>}
        </>
    )
}
