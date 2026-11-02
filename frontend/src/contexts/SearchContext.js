import { createContext, useState, useContext, useEffect } from "react";
import { useGetPosProductsQuery } from "../features/centerSlice";
import { useSelector } from "react-redux";

const SearchContext = createContext();

export const SearchProvider = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const {theme} = useSelector(s => s.auth)
  const [focused, setFocused] = useState(false)
  const token = localStorage.getItem('pos-token');
  const {refetch} = useGetPosProductsQuery(token, {
    skip: !token
  })
  const [sessions, setSession] = useState(JSON.parse(localStorage.getItem('cartSessions') ?? '[1]'));
  const lastActive = localStorage.getItem('_pos_current_session')
  const [ activeSession, setActiveSession ] = useState(lastActive ? JSON.parse(lastActive) : sessions[sessions.length-1]);
  const [displayImage, setImageDisplay] = useState(JSON.parse(localStorage.getItem('img_disp')??'true'))
  const handleImageDisplay = display => {
    localStorage.setItem('img_disp', display );
    refetch()
    setImageDisplay(display);
  }
  useEffect(()=> {
    if(theme==='retro') {
      handleImageDisplay(false)
    }
  },[ theme ])

  const [ sale, setType ] = useState(JSON.parse(localStorage.getItem('_is_sale')??'true'));
  const [ quick, setQuick ] = useState(false);
  return (
    <SearchContext.Provider 
    value={{
        searchQuery, 
        setSearchQuery, 
        sessions,
        setSession,
        activeSession,
        setActiveSession,
        displayImage,
        handleImageDisplay,
        sale,
        setType,
        setFocused,
        focused,
        quick,
        setQuick
    }}>
      {children}
    </SearchContext.Provider>
  );
};

// Custom hook for using the context
export const useSearch = () => useContext(SearchContext);