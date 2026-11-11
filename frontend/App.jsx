import React, { useState } from "react";
import axios from "axios";

const API_URL = "https://api.promoter.thevuteam.com";

function App(){
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [login, setLogin] = useState({username:'', password:''});
  const [form, setForm] = useState({store_name:'', products_sold:'', location:'', extra:''});

  const doLogin = async () => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, login);
      setToken(res.data.access_token);
      localStorage.setItem('token', res.data.access_token);
    } catch (e) {
      alert("Login failed: " + (e.response?.data?.detail || e.message));
    }
  };

  const submitForm = async () => {
    try {
      await axios.post(`${API_URL}/forms/submit`, form, { headers: { Authorization: `Bearer ${token}` }});
      alert("ثبت شد");
    } catch (e) {
      alert("Submit failed: " + (e.response?.data?.detail || e.message));
    }
  };

  if(!token){
    return (
      <div>
        <h2>ورود</h2>
        <input placeholder="username" onChange={e=>setLogin({...login, username:e.target.value})} />
        <input placeholder="password" type="password" onChange={e=>setLogin({...login, password:e.target.value})} />
        <button onClick={doLogin}>ورود</button>
      </div>
    )
  }

  return (
    <div>
      <h2>فرم ثبت فروشگاه</h2>
      <input placeholder="نام فروشگاه" onChange={e=>setForm({...form, store_name:e.target.value})} />
      <input placeholder="محصولات فروخته شده" onChange={e=>setForm({...form, products_sold:e.target.value})} />
      <input placeholder="لوکیشن" onChange={e=>setForm({...form, location:e.target.value})} />
      <input placeholder="توضیحات" onChange={e=>setForm({...form, extra:e.target.value})} />
      <button onClick={submitForm}>ثبت</button>
      <button onClick={() => {setToken(''); localStorage.removeItem('token');}}>خروج</button>
    </div>
  )
}

export default App;
