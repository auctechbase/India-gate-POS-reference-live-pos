import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux"; 
import { useEffect, useState } from "react";
import Loader from "react-js-loader";
import { Toaster } from "react-hot-toast";
import Navbar from "./Navbar";
import LogViewer from "../config/LogViewer";

const FullLayout = () => { 

    let navigate = useNavigate();
    let location = useLocation();
    const { userToken } = useSelector(state=>state.auth);
    let isLoading = useSelector( state => state.auth.loading);
    let isLoggedIn = userToken;
    const [ loading, setLoading] = useState(isLoading);

    // Support only: the log viewer is not on any menu (customers don't need it).
    // Ctrl + Shift + L opens it on any screen, e.g. while connected to the till remotely.
    const [ logsOpen, setLogsOpen ] = useState(false);
    useEffect(() => {
        const onKey = (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
                e.preventDefault();
                setLogsOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(()=> {
        setLoading(isLoading)
        return ()=>null
    },[userToken , isLoading, navigate ])

    return (
    <>
        <Toaster/>
        { isLoggedIn && <LogViewer isOpen={logsOpen} onClose={() => setLogsOpen(false)} /> }
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