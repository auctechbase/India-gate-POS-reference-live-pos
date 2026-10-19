import axios from "axios";

let userToken = localStorage.getItem('pos-token') ?? null
const isAdmin = JSON.parse(localStorage.getItem('isAdmin'))??false;
const myInfo = JSON.parse(localStorage.getItem('pos-user')??'{}')
const cartProducts = JSON.parse(localStorage.getItem('cartProducts')??'{"1":[]}');
const cartStocks = JSON.parse(localStorage.getItem('cartStocks')??'{}')
const openingCash = JSON.parse(localStorage.getItem('openingCash')??'{}');
const cashAmount = Object.keys(openingCash).length? parseFloat((openingCash.opening_cash).replace('€ ','')): 0;
const appKey = localStorage.getItem('_pos_app_key')??'';
const inventory = JSON.parse(localStorage.getItem('INVENTORY_IS')??'true');
const headers = {
    headers: {
        'Content-Type' : 'application/json',
        'pos-token': localStorage.getItem('pos-token')
    }
}

let stockAlert = JSON.parse(localStorage.getItem('_pos_stock_alert')??'0');
if(!stockAlert) {
    if(userToken) {
        axios.get(process.env.REACT_APP_BACKEND_URI+ `config/stock-alert`, headers).then(({data}) => {
            if(data.status && data.stock) {
                localStorage.setItem('_pos_stock_alert', JSON.stringify(data.stock))
            }
        }).catch(err=> {
            if(err.status===401) {
                localStorage.clear();
                window.location.reload();
            }
        });
    }
}

const initialState = {
    theme: localStorage.getItem('_pos_theme')??'default',
    loading:false,
    myInfo,
    userToken,
    error: null,
    errorCode:null,
    success: false, 
    currency: '€ ',  
	search:'',  
    isAdmin,
    openingCash,
    cartProducts,
    split: JSON.parse(localStorage.getItem('split')??'false'),
    cartStocks,
    appKey,
    stockAlert,
    cashAmount,
    inventory,
    categories:JSON.parse(localStorage.getItem('_cats')??'{}'),
    hasKeyboard: JSON.parse(localStorage.getItem("_has_keyboard")??'false'),
    allProds: JSON.parse(localStorage.getItem('_with_all_products')??'true'),
    settings:JSON.parse(localStorage.getItem("_pos_settings")??'{}')
}

const authReducer = (state=initialState,action) => {
    switch(action.type){
        case "THEME": {
            localStorage.setItem('_pos_theme', action.payload)
            return {
                ...state,
                theme: action.payload
            }
        }
       
        case 'SET_TOKEN':  
            return {
                ...state,
                loading:false,
                userToken:action.payload
            }
        case 'SET_AUTH':
            return {
                ...state,
                loading:false,
                myInfo:action.payload
            }
        case 'LOGOUT':
            // localStorage.removeItem('pos-token'); 
            // localStorage.removeItem('pos-user');
            localStorage.setItem('cartStocks', JSON.stringify({}));
            let fresh = {1:[]}
            localStorage.setItem('cartProducts', JSON.stringify(fresh));

            return {
                ...state,
                myInfo:null,
                cartProducts:fresh,
                userToken:null,
                cartStocks:{},
                loading:false,
            }
            
        case 'LOADING': 
            return {
                ...state,
                loading:true
            } 
        case 'SET_CURRENCY': 

            localStorage.setItem(`currency`, action.payload )

            return {
                ...state,
                currency:action.payload,
            }

        case 'STOP_LOADING':
            return {
                ...state,
                loading:false
            } 
		
		case 'SEARCH':
			return {
				...state,
				search:action.payload
			}
            
        case 'ERROR':{
            return {
                ...state,
                error:action.payload.error,
                errorCode:action.payload.code
            }
        }

        case "SPLIT": {
            localStorage.setItem('split', action.payload);
            return {
                ...state,
                split: action.payload
            }
        }
            
        case 'SET_ADMIN_STATUS':
            localStorage.setItem('isAdmin', action.payload )
            return {
                ...state,
                isAdmin:action.payload
            }
        case 'CHOOSEN_PRODUCT':
            localStorage.setItem('cartProducts', JSON.stringify(action.payload??[]));
            const sale = JSON.parse(localStorage.getItem('_is_sale')??'true')
            let prod = Object.values(Object.values(action.payload).flat()) // Get all the arrays in the object
            .flat() // Flatten them into one array
            .reduce((acc, product) => {
                acc[product.id] = ((acc[product.id]-0) || 0) + (product.unit==='kg' ? product.stock - 0: (product.unit==='gm'? product.stock / 1000 : (product.unit ==='mg'? product.stock / 100000 : product.stock))); // Sum stocks by product id
                return acc;
              }, {})
            if(state.inventory && sale) localStorage.setItem('cartStocks', JSON.stringify(prod));
            return {
                ...state,
                cartProducts:action.payload,
                cartStocks:state.inventory && sale? prod: state.cartStocks
            }

        case 'CART_STOCKS':
            localStorage.setItem('cartStocks', JSON.stringify(action.payload))
            return {
                ...state,
                cartStocks: action.payload
            }

        case "SET_CASH" : {
            localStorage.setItem('openingCash', JSON.stringify(action.payload));
            return {
                ...state,
                openingCash:action.payload
            }
        }

        case "RESET_KART": {
            localStorage.setItem('cartStocks', JSON.stringify({}));
            let fresh = {1:[]}
            localStorage.setItem('cartProducts', JSON.stringify(fresh));
            return {
                ...state,
                cartProducts:fresh,
                cartStocks:{}
            } 
        }
        case "SET_APP_KEY" : {
            localStorage.setItem("_pos_app_key", action.payload);
            return {
                ...state,
                appKey: action.payload
            }
        }

        case "DAY_CLOSE" : {
            localStorage.setItem('openingCash', '{}');
            localStorage.setItem('cartSessions','[1]')
            return {
                ...state,
                openingCash:{}
            }
        }

        case "STOCK_ALERT" : {
            if(action.payload){
                localStorage.setItem('_pos_stock_alert', typeof action.payload ==='string'? action.payload: JSON.stringify(action.payload));
            }
            return {
                ...state,
                stockAlert:action.payload
            }
        }

        case "INVENTORY_IS" : {
            localStorage.setItem('INVENTORY_IS', action.payload)
            return {
                ...state,
                inventory: action.payload
            }
        }

        case "SETTINGS" : {
            const setts = {}
            action.payload.forEach( set => {
                setts[set.key] = set.value
            })
            localStorage.setItem("_pos_settings", JSON.stringify(setts))
            return {
                ...state, 
                settings: setts
            };
        }
        default : return state

        case "CATEGORIES" : {
            let obj = {}
            action.payload.forEach( i => {
                if((i.name).toLowerCase().indexOf('veg')!==-1) {
                    obj[i.id] = i.name
                }
            })
            localStorage.setItem('_cats', JSON.stringify(obj))
            return {
                ...state,
                categories: obj 
            }
        }

        case "KEYBOARD": {
            localStorage.setItem("_has_keyboard", action.payload)
            return {
                ...state, 
                hasKeyboard: action.payload
            }
        }
        
        case "WITH_ALL_PRODUCTS": {
            localStorage.setItem("_with_all_products", action.payload)
            return {
                ...state, 
                allProds: action.payload
            }
        }

    }
}
export {authReducer}