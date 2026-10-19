import axios from 'axios';
import { useEffect, useRef, useState } from 'react'
import $ from 'jquery'
import { formatDatefromTimestamp } from '../../helpers/utils';
import toast from 'react-hot-toast';

function Report() {
    const tableRef = useRef(null);
    const [reports, setReports] = useState([])

    useEffect(()=> {
        axios.get(`orders/reports`).then(({data}) => {
            setReports(data.reports)
        }).catch(()=> {})
    },[])

    useEffect(()=> {
        
        $(tableRef.current).DataTable({
            data: reports,
            columns:[
                { title:'ID', data:'id'},
                { title:'Generated On', data:null, render: row => formatDatefromTimestamp(row.date)},
                { title:"Action", data:null, render:row => `<a target="_blank" class="btn btn-sm text-decoration-none btn-info" href="${process.env.REACT_APP_IMAGE_URI}/${row.path}" download type="button" data-index="${reports.indexOf(row)}">View</a>
                <span data-id="${row.id}" style="border:1px solid" class=" ms-4 btn btn-sm text-danger btn-rounded del">Delete</span>` },
            ],
            paging: true,
            searching: true,
            info: true,
            ordering: false,
            pageLength: 40
        });

        $(tableRef.current).on('click', '.del', function(e){
            const ID = this.dataset.id
            axios.get(`orders/remove-report/${ID}`).then(({data}) => {
                if(data.status) {
                    toast.success(data.message)
                    setReports(reports.filter( i => i.id!== parseInt(ID)))
                } else {
                    toast.error(data.message)
                }
            }).catch(()=> toast.error("Something went wrong!"))
        })

        return () => {
            $(tableRef.current).off('click', '.del')
            $(tableRef.current).DataTable().destroy()
        }

    },[reports])

    return (
    <div className="content-wrapper" style={{width:'100%'}}>
        <div className="row">
            <div className="col-lg-12 grid-margin stretch-card">
                <div className="card mt-5">
                    <div className="card-body">
                        <div className="table-responsive">
                            <table className="table table-hover table-bordered" ref={tableRef} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    )
}

export default Report