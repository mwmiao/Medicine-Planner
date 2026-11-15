/** Script inline executado antes da página aparecer, para evitar "piscar" de idioma/tamanho. */
export const PREFERENCES_BOOT_SCRIPT = `try{var l=null;try{l=localStorage.getItem("mp.locale")}catch(e){}document.documentElement.lang=l==="pt"?"pt-PT":"zh-CN";var s=localStorage.getItem("mp.textSize");if(s==="large"||s==="xlarge")document.documentElement.dataset.textSize=s;}catch(e){}`;
