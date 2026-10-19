import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux"; 
import { useEffect, useState } from "react";
import Loader from "react-js-loader";
import { Toaster } from "react-hot-toast";
import Navbar from "./Navbar";

const FullLayout = () => { 

    let navigate = useNavigate();
    let location = useLocation();
    const { userToken } = useSelector(state=>state.auth);
    let isLoading = useSelector( state => state.auth.loading);
    let isLoggedIn = userToken;
    const [ loading, setLoading] = useState(isLoading);

    useEffect(()=> {  
        setLoading(isLoading)
        return ()=>null
    },[userToken , isLoading, navigate ])

    return (
    <>
        <Toaster/>	 
        <div className={`${loading?'layout-item':"layout-item d-none"}`}> 
            <Loader type="spinner-default" bgColor={'gray'} color={'white'} size={70}/>
        </div>
        { isLoggedIn && <Navbar/> }
        <div className={`container1 page-body-wrapper w-100 ${location.pathname==='/dashboard'? 'home':''}`} style={{
                minHeight: location.pathname==='/login'? 0 :'100vh',
                paddingTop: location.pathname==='/login'? 0 :76
            }}>
            <div className={`${['/pos','/pos/customer','/pos/'].includes(location.pathname)? 'pos-panel':'main-panel'} w-100 ${location.pathname==='/login'?'login':''} ${location.pathname.indexOf('payment')!==-1 ? 'payment-screen':''}`} >
                <Outlet />
            </div>
        </div>
    </>
    );
};

export default FullLayout;