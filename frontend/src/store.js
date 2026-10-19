import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from './reducers/theReducer'  
import { commonApiSlice } from './features/centerSlice';
// import centerApiReducer from './features/centerSlice';
import { setupListeners } from '@reduxjs/toolkit/query';

export const store = configureStore({
    reducer: { 
		auth:authReducer ,
		[commonApiSlice.reducerPath]:commonApiSlice.reducer, // will create a dynamic reducer name accordingly
	}, 
	middleware: getDefaultMiddleware =>
		getDefaultMiddleware().concat([commonApiSlice.middleware])
})

setupListeners(store.dispatch)
// setupListeners(store.dispatch) 