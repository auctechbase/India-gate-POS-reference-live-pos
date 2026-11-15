import axios from 'axios';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import {Link} from 'react-router-dom';
import { Button, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row } from 'reactstrap';

export default function User() {

    const dispatch = useDispatch();
    const [ open, setModal ] = useState(false);
    const { fields, setFields } = useState({email:''});
    const toggleModal = () => setModal(!open);
    const change = e => setFields({ ...fields, email: e.target.value })

    const handleSubmit = e => 
    {
        e.preventDefault();

        if(!fields.email) return toast.error("Enter the email first!");

        dispatch({ type:"LOADING" });
        axios.get( `/users/create`, fields )
        .then( ({data}) => console.log(data) )
        .catch( er => console.log(er.message) )
        .finally( () => dispatch({type:"STOP_LOADING"}) )

    }

    const AddNew = () => {

        return (
            <Modal isOpen={open} toggle={toggleModal} >
                <Form onSubmit={handleSubmit}>
                    <ModalHeader>
                        <h4>Add New</h4>
                    </ModalHeader>
                    <ModalBody>
                        <Row>
                            <FormGroup>
                                <Label> Email </Label>
                                <Input type='text' bsSize={'lg'} onChange={change} />
                            </FormGroup>
                        </Row>
                    </ModalBody>
                    <ModalFooter>
                        <Button className='btn-light btn' onClick={toggleModal}> Close </Button>
                        <Button className='btn-success btn'> Submit </Button>
                    </ModalFooter>
                </Form>
            </Modal>
        );

    }

    return (
        <>
        <div className="content-wrapper">
            <div className="row">
                <div className="col-md-12">
                    <div className="card">
                        <div className="card-header position-relative " style={{minHeight:67}}>
                            <button className="btn btn-success position-absolute" style={{right:'12px',top:'12px',borderRadius:'20px'}} onClick={toggleModal}> + New </button>
                        </div>
                        <div className="card-body">
                            <div className="table-responsive">
                                <table className="table table-hover table-stripped">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Status</th>
                                            <th>Verified</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="users"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <AddNew/>
        </>
    )
}
