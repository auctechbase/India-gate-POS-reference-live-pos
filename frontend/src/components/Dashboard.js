import React, { memo, useEffect } from 'react';
import {useDispatch, useSelector} from 'react-redux'
import inventory from '../asset/images/inventory.webp';
import store from '../asset/images/store.png';
import cart from '../asset/images/cart.webp';
import config from '../asset/images/config.png';
import sales from '../asset/images/sales.webp';
import offers from '../asset/images/offers-tile.svg';
import website from '../asset/images/website-tile.svg';
import {Link} from 'react-router-dom';
import { useGetSettingsQuery } from '../features/centerSlice';
import './Dashboard.css';

// Same tiles and order as Sardar Ji's home: four on the first row, three on the second.
const TILES = [
    { to: '/pos', label: 'Point of sale', retro: 'POS', image: store },
    { to: '/inventory', label: 'Inventory', retro: 'INVENTORY', image: inventory },
    { to: '/products', label: 'Products', retro: 'PRODUCTS', image: cart },
    { to: '/configuration', label: 'Configuration', retro: 'CONFIG', image: config },
    { to: '/sales', label: 'Sales', retro: 'SALES', image: sales },
    { to: '/offers', label: 'Offers', retro: 'OFFERS', image: offers },
    { to: '/website', label: 'Website', retro: 'WEBSITE', image: website },
];

function Dashboard() {
    const dispatch = useDispatch()
    const { theme } = useSelector( s => s.auth);
    const {data, isSuccess } = useGetSettingsQuery();

    useEffect(()=>{
        if(isSuccess && data?.settings) {
            dispatch({type:"SETTINGS", payload: data.settings})
        }
    },[data, data?.settings, isSuccess]);

    return (
        <div className="container">
            <div className="d-grid home-grid">
                <div className="d-flex w-100 home-tiles">
                    <div className="col-md-8">
                        <div className="row justify-content-center">
                            {TILES.map(tile => (
                                <div key={tile.to} className="col-md-3 text-center">
                                    <Link to={tile.to}>
                                        <div className="card redirect" title={tile.label}>
                                            <div className="card-body">
                                                <div className="home-tile-image">
                                                    {theme === 'retro'
                                                        ? <h1>{tile.retro}</h1>
                                                        : <img src={tile.image} className="w-100" alt='' />}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                    {theme !== 'retro' && <h5 className="pt-3">{tile.label}</h5>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default memo(Dashboard)
