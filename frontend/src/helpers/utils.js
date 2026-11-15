import $ from 'jquery'
import toast from 'react-hot-toast';
const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const validate = (fields,exceptions=[]) => {
    let result={}
    var shouldGo=true;
    if(exceptions.length)
    {
        exceptions.forEach( item => {
            delete fields[item]
        })
    }
    Object.keys(fields).forEach(f =>
    {
        let shout = '';
        let invalid = false;
        let tInputs = [$(`input[name=${f}]`), $(`select[name=${f}]`), $(`textarea[name=${f}]`), $(`.${f}`)]
        if(fields[f]==null || fields[f].length===0)
        {
            result[f]=`Required!`;
            shouldGo=false;
            invalid = true;
        }
        tInputs.forEach( input => {

            let minLength = $(input).attr('type')!== 'date' ? $(input).attr('min'): 0;
            let maxLength = $(input).attr('max');
            let type = $(input).attr('cast');
            let isDate = $(input).attr('type')==='date' && $(input).attr('req');
            if($(input).val()?.length && (minLength || maxLength))
            {
                if($(input).val().length < parseInt(minLength))
                { 
                    invalid = true;
                    shout = `Should be of at least ${minLength} characters!`
                    result[f] = shout;
                }
                if($(input).val().length > parseInt(maxLength))
                { 
                    invalid = true;
                    shout = `Should not be greater than ${maxLength} characters!`;
                    result[f] = shout;
                }
            }
            if(type)
            { 
                if(input.val() && type === 'num')
                {
                    if(parseInt($(input).val().length )!== $(input).val().length) {
                        shout= `Should be in numbers!`;
                        invalid = true;
                        result[f]= shout; 
                    }
                }
                if( $(input).val() && type=== 'str' )
                {
                    if( /^([^0-9]*)$/.test($(input).val())===false )
                    {
                        shout= `Should not contain numbers!`;
                        invalid = true;
                        result[f]= shout; 
                    }
                }
            }
            if(isDate)
            {
                if(!isValidDate($(input).val(),18))
                {
                    invalid = true
                    shout = 'Invalid date';
                    result[f] = shout;
                } else {
                    shout = '';
                }
                // return
            }
            if(shout)   
            {
                if($(input).parents('.col-md-12, .col').find('small.text-danger').length)
                {
                    $(input).parents('.col-md-12, .col').find('small.text-danger').text(shout)
                } else {
                    $(input).parents('.col-md-12, .col').append('<small class="text-danger">'+shout+'</small>')
                }
            } else {
                $(input).parents('.col-md-12, .col').find('small.text-danger').remove()
            }
            if(invalid){
                shouldGo = false;
                $(input).addClass('placeholder-error')
                .attr('placeholder',result[f]).css('border','1px solid red');
            } else {
                $(input).removeClass('placeholder-error').attr('placeholder',result[f]).css('border','');
            }
        })
    })
    return {result, shouldGo};
}

export const dealHost = imgPath => {
    if(imgPath==null) return '/images/default.png';
    if(imgPath?.indexOf('https')!== -1) return imgPath;
    if(imgPath?.indexOf('data:image') !== -1) return imgPath
    return process.env.REACT_APP_IMAGE_URI +'/'+ imgPath
}

export const getCurrentDate = (delimiter='-') => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(today.getDate()).padStart(2, '0');
    return `${year+delimiter+month+delimiter+day}`;
}

export const formatDate = (date=null,format='Ymd') => {
    const dateObj = date?new Date(date): new Date();
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(dateObj.getDate()).padStart(2, '0');
    if(format[0]==='Y')
    {
        return `${year}-${month}-${day}`;
    }
    if(format[0]==='d')
    {
        return `${day}-${month}-${year}`;
    }
}

export const getCurrentDay = () => {
    return daysOfWeek[(new Date()).getDay()];
}

export const getCurrentTime = () => {
    const currentDate = new Date();
    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

export const toBase64 = blob => {
    console.log(blob)
}

export const dataURLtoFile = (dataurl, filename) => {
    var arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[arr.length - 1]), 
        n = bstr.length, 
        u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

export const isValidDate = ( date, range ) => {
    let today = getCurrentDate();
    let year = today.split('-')[0];
    let intended = new Date(today.replace(year, (parseInt(year)-range)));
    return intended > new Date(date)
}

export const capitalFirst = (string) => {
    if (!string) return string; // Handle empty or null strings
    if(string.includes(' ')){
        let str= '';
        string.split(' ').forEach( part => {
           str+=' '+ part.charAt(0).toUpperCase() + part.slice(1); 
        })
        return str;
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export const Warning = msg => {
    return toast(msg,
        {
          icon: '⚠️',
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
        }
    );
}

export const hexToRgb = (hex) => {
    // Remove the '#' if present

    if(!hex || typeof hex == 'object'){
        return hex
    }

    hex = hex.replace(/^#/, '');
    // Convert shorthand hex (e.g., #03F) to full form (e.g., #0033FF)
    if (hex.length === 3) {
        hex = hex.split('').map(h => h + h).join('');
    }
    // Convert hex to RGB
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return { r, g, b };
}

export const isColorDark = (hexColor) => {
    // Convert hex color to RGB
    let output = hexToRgb(hexColor)
    if(output === undefined) return hexColor
    const { r, g, b } = output

    // Calculate the luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // Return true if the color is dark, else false
    return luminance < 128;
}

export function chunk(array, size, uncategorized = false) {
    const result = [];
    if(!array) return []
    if(uncategorized) array.unshift({})
    for (let i = 0; i < array.length; i += size) {
        // Use slice to get a chunk of the specified size and push it to the result array
        result.push(array.slice(i, i + size));
    }
    return result;
}

export const wrapText = (text, maxLength) => {

    if (text?.length > maxLength) {
        let truncatedText = text.substring(0, maxLength) + '...';
        return truncatedText;
    }
    return text
}

export const formatDatefromTimestamp = (timestamp, needDate=false) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if(needDate) return `${year}-${month}-${day}`;
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};
  
export const f = value => {
    if(typeof value==='string' && value.indexOf(' ')!==-1) {
        value = value.replace(' ','')
    }
    return parseFloat(value).toFixed(2);
}