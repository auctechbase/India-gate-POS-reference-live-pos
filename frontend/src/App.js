import axios from "axios"; 
import Themeroutes from "./routes/Router";

import ShowError from './components/errors/ShowError';
import "./asset/css/materialdesignicons.min.css";
import "./asset/css/all.min.css";
import "./asset/css/fontawesome.min.css";
import 'datatables.net-dt'
import 'datatables.net-dt/css/dataTables.dataTables.css'
import 'jquery/dist/jquery.min.js';
import 'bootstrap/dist/js/bootstrap.min.js';

import { useSelector } from "react-redux";
import { useLocation, useNavigate, useRoutes } from "react-router-dom";
import { useEffect } from "react";
import { Warning } from "./helpers/utils";

const token = localStorage.getItem('pos-token');
let headers;
if(token) {
    headers = {
        'Content-Type' : 'application/json',
        'pos-token' : token
    }
} else {
    headers = { 'Content-Type' : 'application/json' }
}
axios.defaults.baseURL=process.env.REACT_APP_BACKEND_URI??'http://localhost:5100';

axios.defaults.headers.common = headers;

function App() {

    let { userToken } = useSelector(state=>state.auth);
    const { error, errorCode } = useSelector( state => state.auth )
    let navigate = useNavigate();
    let location = useLocation();
    useEffect(()=> {
        if( userToken===null ) {
            navigate('/login')
        }
        if(localStorage.getItem('_last_location')) {
            if(location.pathname.indexOf('/customer')=== -1) {
                let to = localStorage.getItem('_last_location');
                localStorage.removeItem('_last_location');
                navigate(to)
            }
        }
        return () => {}

    },[ userToken, navigate ])

    useEffect(() => {
        const handleError = error => Warning(error);
        window.electronAPI?.hasError(handleError);
    },[])
    
    const routing = useRoutes(Themeroutes);
    if(error) {
        if(errorCode===500) {
            return <ShowError error={error}/>
        }
    }
    return routing;
}

export default App;
