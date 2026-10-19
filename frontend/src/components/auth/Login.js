import React, {useEffect, useRef, useState} from 'react';
import TouchKeyboard from '../common/TouchKeyboard';
import logo from '../../asset/images/pos.png';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {

    const navigate = useNavigate();
    const dispatch = useDispatch(); 

    const keyboardRef = useRef()
    const [fields, setFields] = useState({email:'',password:''})
    const onchange = e => setFields({...fields, [e.target.name]:e.target.value})

    const [focused, setFocused] = useState('')
    const [ preset, setPreset ] = useState('')
    const handleLogin = async(event) => {
        event.preventDefault() 
        dispatch({ type:'LOADING' })
        try {
            axios.post(`auth/login`, fields ).then( async ({ data }) => {  
            if( data.authToken ) {

                localStorage.setItem('pos-token', data.authToken )
                localStorage.setItem('pos-user', JSON.stringify(data.user))

                dispatch({ type:'SET_TOKEN', payload: data.authToken }) 
                dispatch({ type:'SET_AUTH', payload: data.user })  
                dispatch({ type:'SET_ADMIN_STATUS', payload: data.user.type==='admin' })
                dispatch({ type:'SET_CURRENCY', payload: data.currency })
                return navigate('/dashboard')

            }}).catch(()=>{
                toast.error('Invalid credentials!') 
                localStorage.clear()
            }).finally(() => dispatch({ type:'STOP_LOADING' }))

        } catch (error) {
            console.log(error)
            localStorage.clear()
        }

    }  
    const inputStyle = {borderRadius:'50px'}

    useEffect(()=>{
        keyboardRef.current?.clearInput()
    },[preset])

    return (
        <> 
            <div className="container-scroller">
                <div className="container-fluid page-body-wrapper auth full-page-wrapper">
                    <div className="content-wrapper d-flex align-items-center auth px-0">
                    <div className="row w-100 mx-0">
                        <div className="col-lg-4" style={{marginLeft:'26%'}}>
                        <div className="auth-form-light text-left py-5 px-4 px-sm-5" style={{borderRadius:'12px'}}>
                            <center><img src={logo} alt="logo" height={100} width={150}/></center>
                            <h4> Hello!</h4>
                            <h6 className="fw-light"> Sign in to continue. </h6>
                            <form className="pt-3" onSubmit={handleLogin} method="POST">
                                <div className="form-group">
                                    <input type="email" 
                                        name="email" 
                                        style={inputStyle} 
                                        className="form-control form-control-lg" 
                                        placeholder="Enter email" 
                                        onChange={onchange}
                                        value={fields.email}
                                        onClick={()=>{
                                            setFocused('email');
                                            setPreset('')
                                        }}
                                    />
                                </div>
                                <div className="form-group">
                                    <input type="password" 
                                        name="password"
                                        style={inputStyle} 
                                        className="form-control form-control-lg" 
                                        placeholder="Password"
                                        onChange={onchange} 
                                        onClick={()=> {
                                            setFocused('password')
                                            setPreset('sd')
                                        }}
                                        defaultValue={fields.password}
                                    />
                                </div>
                                <div className="mt-3 d-grid gap-2">
                                    <button className="btn btn-block btn-primary btn-lg fw-medium auth-form-btn" style={inputStyle} type="submit">SIGN IN</button>
                                </div>
                                <div className="my-2 d-flex justify-content-center align-items-center">
                                </div>
                            </form>
                        </div>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
            {focused && <TouchKeyboard
                open
                value={fields[focused]}
                onChange={v => setFields({...fields, [focused]: v})}
                label={focused === 'password' ? 'Password' : 'Email'}
                masked={focused === 'password'}
                onClose={() => setFocused('')}
                onDone={focused === 'password' ? () => { setFocused(''); handleLogin({ preventDefault() {} }) } : () => setFocused('password')}
            />}
        </>
  )
}
