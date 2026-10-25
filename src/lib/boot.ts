/** Script inline executado antes da página aparecer, para evitar "piscar" de idioma/tamanho. */
export const PREFERENCES_BOOT_SCRIPT = `try{var l=localStorage.getItem("mp.locale");document.documentElement.lang=l==="zh"?"zh-CN":"pt-PT";var s=localStorage.getItem("mp.textSize");if(s==="large"||s==="xlarge")document.documentElement.dataset.textSize=s;}catch(e){}`;
