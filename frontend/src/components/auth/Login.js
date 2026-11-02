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
    const [fields, setFields] = useState({email:'',password:'',name:'',confirm:''})
    // First run: no user exists yet, so show "Create admin account" instead of the login form.
    const [needsSetup, setNeedsSetup] = useState(false)
    useEffect(() => {
        axios.get('auth/setup').then(({ data }) => setNeedsSetup(Boolean(data.needsSetup))).catch(() => {})
    }, [])
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
    const createAdmin = async (event) => {
        event.preventDefault()
        if (fields.name.trim().length < 3) return toast.error('Enter your name (at least 3 letters)')
        if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) return toast.error('Enter a valid email')
        if (fields.password.length < 6) return toast.error('Password must be at least 6 characters')
        if (fields.password !== fields.confirm) return toast.error('Passwords do not match')
        dispatch({ type:'LOADING' })
        try {
            const { data } = await axios.post('auth/signup', { name: fields.name.trim(), email: fields.email.trim(), password: fields.password })
            if (!data.status) throw new Error(data.message || 'Could not create the account')
            toast.success('Admin account created!')
            setNeedsSetup(false)
            handleLogin({ preventDefault() {} })
        } catch (error) {
            toast.error(error.response?.data?.message || error.message)
            dispatch({ type:'STOP_LOADING' })
        }
    }
    const inputStyle = {borderRadius:'50px'}
    const KB_LABELS = { name: 'Your name', email: 'Email', password: 'Password', confirm: 'Repeat password' }
    const SETUP_ORDER = ['name', 'email', 'password', 'confirm']

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
                            {needsSetup ? <>
                                <h4> Welcome!</h4>
                                <h6 className="fw-light"> Create the admin account to start using the POS. </h6>
                                <form className="pt-3" onSubmit={createAdmin} method="POST">
                                    {[['name','text','Your name'],['email','email','Email'],['password','password','Password (min. 6 characters)'],['confirm','password','Repeat password']].map(([name,type,placeholder]) => (
                                        <div className="form-group" key={name}>
                                            <input type={type} name={name} style={inputStyle} className="form-control form-control-lg"
                                                placeholder={placeholder} onChange={onchange} value={fields[name]}
                                                onClick={() => setFocused(name)} />
                                        </div>
                                    ))}
                                    <div className="mt-3 d-grid gap-2">
                                        <button className="btn btn-block btn-primary btn-lg fw-medium auth-form-btn" style={inputStyle} type="submit">CREATE ACCOUNT</button>
                                    </div>
                                </form>
                            </> : <>
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
                                        value={fields.password}
                                    />
                                </div>
                                <div className="mt-3 d-grid gap-2">
                                    <button className="btn btn-block btn-primary btn-lg fw-medium auth-form-btn" style={inputStyle} type="submit">SIGN IN</button>
                                </div>
                                <div className="my-2 d-flex justify-content-center align-items-center">
                                </div>
                            </form>
                            </>}
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
                label={KB_LABELS[focused]}
                masked={focused === 'password' || focused === 'confirm'}
                onClose={() => setFocused('')}
                onDone={needsSetup
                    ? () => { const next = SETUP_ORDER[SETUP_ORDER.indexOf(focused) + 1]; if (next) setFocused(next); else { setFocused(''); createAdmin({ preventDefault() {} }) } }
                    : focused === 'password' ? () => { setFocused(''); handleLogin({ preventDefault() {} }) } : () => setFocused('password')}
            />}
        </>
  )
}
