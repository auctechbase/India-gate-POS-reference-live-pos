export const upperStyle = {
    overflow: "hidden",
    position: "relative",
    touchAction:'none'
}

export const innerStyle = {
    background: "#444",
    color: "#fff",
    padding: 10,
    cursor: "grab",
    textAlign: "center",
    borderRadius: "8px 8px 0 0",
    touchAction:'none',
    display:'flex',
    justifyContent:'space-between',
    alignItems:'center'
}

export const outerStyle = {
    position: "fixed",
    zIndex: 1000,
    width:700,
    resize:'both',
    touchAction:'none',
    overflow:'auto',
    transformOrigin: "top center",
}

export const footerBorder = {border:'1px solid gray'}

export const footerStyle = {justifyContent:'space-between',padding:'5px 20px'}

export const fullDisplay = {
    "{lock}":"Caps",
    "{bksp}":"Backspace",
    "{space}":"Space"
}

export const bkspDisplay = { 
    "{bksp}":"x", 
}