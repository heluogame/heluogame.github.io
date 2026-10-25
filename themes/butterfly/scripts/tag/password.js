const crypto = require("crypto");

const DOWNLOAD_KEY_ITERATIONS = 80000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encryptDownloadUrl(url, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    DOWNLOAD_KEY_ITERATIONS,
    32,
    "sha256"
  );
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipher: Buffer.concat([encrypted, authTag]).toString("base64"),
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    iterations: String(DOWNLOAD_KEY_ITERATIONS),
  };
}

function downloadButton(args) {
  args = args.join(" ").split(" ");

  if (args.length < 3) {
    return "<div>Error: Insufficient arguments for downloadButton tag</div>";
  }

  let text = args.shift().trim();
  let rawUrl = args.shift().trim();
  let plainPassword = args.pop().trim();
  let encryptedDownload = encryptDownloadUrl(rawUrl, plainPassword);
  let modalId = "download-password-" + crypto
    .createHash("md5")
    .update(text + "\0" + rawUrl + "\0" + plainPassword)
    .digest("hex")
    .slice(0, 12);
  const safeText = escapeHtml(text);
  const openDialogScript = `
(function(button){
  var modal=document.getElementById(button.getAttribute('aria-controls'));
  if(!modal){return;}
  var submit=modal.querySelector('.download-password-submit');
  var input=modal.querySelector('.download-password-input');
  var error=modal.querySelector('.download-password-error');
  var form=modal.querySelector('.download-password-panel');
  if(submit){submit.disabled=false;submit.classList.remove('is-busy');}
  if(error){error.textContent='';}
  if(form){form.classList.remove('has-error');}
  var pageKey=(location.pathname||'').replace(/\\/index\\.html$/,'').replace(/\\/$/,'');
  var cooldownKey='downloadButtonCooldown:'+pageKey+':'+(modal&&modal.id?modal.id:button.getAttribute('aria-controls'));
  var cooldownUntil=0;
  try{cooldownUntil=Number(localStorage.getItem(cooldownKey)||0);}catch(e){}
  var waitSeconds=Math.ceil((cooldownUntil-Date.now())/1000);
  if(waitSeconds>0){
    var oldToast=document.querySelector('.download-password-toast');
    if(oldToast)oldToast.remove();
    var toast=document.createElement('div');
    toast.className='download-password-toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.innerHTML='<i class="fas fa-clock" aria-hidden="true"></i><span>检测到您刚才已下载过，请等待 '+waitSeconds+' 秒后再重新下载</span>';
    document.body.appendChild(toast);
    setTimeout(function(){toast.classList.add('is-hide');},1300);
    setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast);},1650);
    return false;
  }
  if(modal.showModal&&!modal.open){modal.showModal();}else{modal.setAttribute('open','');}
  setTimeout(function(){
    var freshInput=modal.querySelector('.download-password-input');
    if(freshInput)freshInput.focus();
  },0);
})(this);
`.trim();
  const submitScript = `
event.preventDefault();
(async function(form){
  var input=form.querySelector('.download-password-input');
  var error=form.querySelector('.download-password-error');
  var submit=form.querySelector('.download-password-submit');
  var value=input.value.trim();
  var passed=false;
  var modal=form.closest('dialog');
  var pageKey=(location.pathname||'').replace(/\\/index\\.html$/,'').replace(/\\/$/,'');
  var cooldownKey='downloadButtonCooldown:'+pageKey+':'+(modal&&modal.id?modal.id:form.dataset.downloadCipher);
  var cooldownMs=180000;
  var cooldownStore=window.__downloadButtonCooldowns||(window.__downloadButtonCooldowns={});
  var show=function(message){
    error.textContent=message||'';
    form.classList.toggle('has-error',!!message);
  };
  var getCooldownUntil=function(){
    var until=0;
    try{until=Number(localStorage.getItem(cooldownKey)||0);}catch(e){until=Number(cooldownStore[cooldownKey]||0);}
    return until||0;
  };
  var setCooldownUntil=function(until){
    cooldownStore[cooldownKey]=until;
    try{localStorage.setItem(cooldownKey,String(until));}catch(e){}
  };
  var b64ToBytes=function(b64){
    var bin=atob(b64);
    var bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++){bytes[i]=bin.charCodeAt(i);}
    return bytes;
  };
  var waitSeconds=Math.ceil((getCooldownUntil()-Date.now())/1000);
  if(waitSeconds>0){
    show('检测到您刚才已下载过，请等待 '+waitSeconds+' 秒后再重新下载');
    input.focus();
    return;
  }
  if(!value){
    show('请输入下载密码');
    input.focus();
    return;
  }
  try{
    submit.disabled=true;
    submit.classList.add('is-busy');
    show('');
    if(!window.crypto||!crypto.subtle||!window.TextEncoder||!window.TextDecoder){
      throw new Error('当前浏览器不支持安全解密，请更换现代浏览器后重试');
    }
    var keyMaterial=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveKey']);
    var key=await crypto.subtle.deriveKey(
      {
        name:'PBKDF2',
        salt:b64ToBytes(form.dataset.downloadSalt),
        iterations:Number(form.dataset.downloadIterations||${DOWNLOAD_KEY_ITERATIONS}),
        hash:'SHA-256'
      },
      keyMaterial,
      {name:'AES-GCM',length:256},
      false,
      ['decrypt']
    );
    var decrypted=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:b64ToBytes(form.dataset.downloadIv)},
      key,
      b64ToBytes(form.dataset.downloadCipher)
    );
    passed=true;
    var url=new TextDecoder().decode(decrypted);
    setCooldownUntil(Date.now()+cooldownMs);
    var oldToast=document.querySelector('.download-password-toast');
    if(oldToast)oldToast.remove();
    form.classList.remove('has-error');
    input.value='';
    if(modal){
      if(modal.open&&modal.close){modal.close();}else{modal.removeAttribute('open');}
    }
    var toast=document.createElement('div');
    toast.className='download-password-toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.innerHTML='<i class="fas fa-check-circle" aria-hidden="true"></i><span>验证成功，正在跳转下载</span>';
    document.body.appendChild(toast);
    setTimeout(function(){toast.classList.add('is-hide');},1300);
    setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast);},1650);
    setTimeout(function(){location.href=url;},450);
  }catch(error){
    var message=error&&error.message&&error.message.indexOf('当前浏览器')===0?error.message:'密码错误，请检查后再试';
    show(message);
    input.select();
  }finally{
    if(!passed){
      submit.disabled=false;
      submit.classList.remove('is-busy');
    }
  }
})(this);
`.trim();
  const safeOpenDialogScript = escapeHtml(openDialogScript);
  const safeSubmitScript = escapeHtml(submitScript);

  return `
<style>
.download-button-wrap {
  display: block;
  margin: 14px 0 0;
  line-height: 0;
}
#article-container blockquote:has(.download-button-wrap) {
  padding-bottom: 10px;
}
#article-container blockquote p:has(.download-button-wrap) {
  margin-bottom: 0;
}
.download-button-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 8px 13px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #2388ff 0%, #22c18f 100%);
  color: #fff;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 10px 20px rgba(35, 136, 255, .22);
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.download-button-trigger:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(35, 136, 255, .3);
  filter: saturate(1.08);
}
.download-button-trigger:active {
  transform: translateY(0);
}
.download-button-trigger i {
  font-size: .95em;
}
dialog.download-password-dialog {
  width: min(430px, calc(100vw - 36px));
  max-width: none;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(100, 136, 190, .2);
  border-radius: 8px;
  background: transparent;
  color: #1f2b42;
  box-shadow: 0 24px 70px rgba(18, 32, 58, .34);
}
dialog.download-password-dialog:not([open]) {
  display: none !important;
}
dialog.download-password-dialog[open] {
  animation: downloadModalIn .2s ease;
}
dialog.download-password-dialog::backdrop {
  background: rgba(14, 21, 38, .45);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  animation: downloadBackdropIn .2s ease;
}
.download-password-panel {
  margin: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, .98), rgba(248, 251, 255, .96));
}
.download-password-head {
  position: relative;
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 22px 22px 18px;
  background:
    radial-gradient(circle at 16% 8%, rgba(34, 193, 143, .22), transparent 30%),
    linear-gradient(135deg, #edf6ff 0%, #fff7fb 58%, #effff7 100%);
}
.download-password-head:before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: linear-gradient(90deg, #2388ff, #22c18f, #ff78a5);
}
.download-password-icon {
  display: grid;
  flex: 0 0 46px;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #2388ff, #22c18f);
  color: #fff;
  box-shadow: 0 10px 22px rgba(35, 136, 255, .25);
}
.download-password-title {
  margin: 0;
  color: #162238;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.25;
}
.download-password-subtitle {
  margin: 5px 0 0;
  color: #6a7892;
  font-size: 13px;
  line-height: 1.5;
}
.download-password-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, .7);
  color: #74829a;
  cursor: pointer;
  transition: background .18s ease, color .18s ease;
}
.download-password-close:hover {
  background: #fff;
  color: #1f2b42;
}
.download-password-body {
  padding: 20px 22px 22px;
}
.download-password-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
  color: #34445f;
  font-size: 14px;
  font-weight: 700;
}
.download-password-badge {
  max-width: 48%;
  overflow: hidden;
  padding: 5px 9px;
  border-radius: 8px;
  background: rgba(35, 136, 255, .1);
  color: #2388ff;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.download-password-field {
  position: relative;
  margin-bottom: 16px;
}
.download-password-field i {
  position: absolute;
  top: 50%;
  left: 14px;
  color: #8ba0bf;
  transform: translateY(-50%);
  pointer-events: none;
}
.download-password-input {
  width: 100%;
  height: 48px;
  box-sizing: border-box;
  border: 1px solid #d8e3f3;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #1d293d;
  font-size: 16px;
  padding: 0 14px 0 42px;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.download-password-input:focus {
  border-color: #2388ff;
  box-shadow: 0 0 0 4px rgba(35, 136, 255, .14);
}
.download-password-tip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: #7a889f;
  font-size: 13px;
  line-height: 1.5;
}
.download-password-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 10px;
  border-left: 3px solid #e7a13b;
  border-radius: 4px;
  background: rgba(231, 161, 59, .09);
  color: #756142;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.65;
}
.download-password-notice i {
  flex: 0 0 auto;
  margin-top: .3em;
  color: #d99128;
}
.download-password-notice p {
  margin: 0;
}
.download-password-error {
  min-height: 0;
  height: 0;
  margin: 0;
  overflow: hidden;
  color: #df3158;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0;
  transition: opacity .18s ease;
}
.download-password-panel.has-error .download-password-error {
  min-height: 20px;
  height: auto;
  margin: 8px 0 0;
  opacity: 1;
}
.download-password-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
.download-password-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 94px;
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
}
.download-password-cancel {
  background: #eef3f9;
  color: #53637a;
}
.download-password-cancel:hover {
  background: #e4ebf5;
}
.download-password-submit {
  background: linear-gradient(135deg, #2388ff, #22c18f);
  color: #fff;
  box-shadow: 0 10px 20px rgba(35, 136, 255, .22);
}
.download-password-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(35, 136, 255, .28);
}
.download-password-submit.is-busy {
  cursor: wait;
  filter: saturate(.75);
}
.download-password-submit:disabled {
  cursor: not-allowed;
  opacity: .72;
  box-shadow: none;
  transform: none;
}
.download-password-toast {
  position: fixed;
  z-index: 10001;
  top: 24px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(24, 35, 52, .94);
  color: #fff;
  font-size: 14px;
  line-height: 1.45;
  box-shadow: 0 14px 36px rgba(18, 32, 58, .28);
  transform: translateX(-50%);
  animation: downloadToastIn .22s ease;
}
.download-password-toast i {
  color: #38e0a3;
}
.download-password-toast.is-hide {
  animation: downloadToastOut .22s ease forwards;
}
[data-theme='dark'] dialog.download-password-dialog {
  border-color: rgba(255, 255, 255, .1);
}
[data-theme='dark'] .download-password-panel {
  background: linear-gradient(180deg, rgba(31, 34, 47, .98), rgba(22, 25, 36, .98));
  color: #f3f6ff;
}
[data-theme='dark'] .download-password-head {
  background:
    radial-gradient(circle at 16% 8%, rgba(34, 193, 143, .18), transparent 30%),
    linear-gradient(135deg, #1d2b45 0%, #2a2030 58%, #173128 100%);
}
[data-theme='dark'] .download-password-title,
[data-theme='dark'] .download-password-close:hover {
  color: #f3f6ff;
}
[data-theme='dark'] .download-password-subtitle,
[data-theme='dark'] .download-password-tip {
  color: #aab6ca;
}
[data-theme='dark'] .download-password-notice {
  border-left-color: #d99a3e;
  background: rgba(217, 154, 62, .12);
  color: #d6c6aa;
}
[data-theme='dark'] .download-password-close {
  background: rgba(255, 255, 255, .08);
  color: #b4c0d4;
}
[data-theme='dark'] .download-password-close:hover {
  background: rgba(255, 255, 255, .14);
}
[data-theme='dark'] .download-password-label {
  color: #dbe5f5;
}
[data-theme='dark'] .download-password-input {
  border-color: rgba(255, 255, 255, .14);
  background: rgba(255, 255, 255, .06);
  color: #f5f7fb;
}
[data-theme='dark'] .download-password-cancel {
  background: rgba(255, 255, 255, .1);
  color: #dce6f6;
}
@keyframes downloadModalIn {
  from { opacity: 0; transform: translateY(14px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes downloadBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes downloadToastIn {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes downloadToastOut {
  from { opacity: 1; transform: translate(-50%, 0); }
  to { opacity: 0; transform: translate(-50%, -8px); }
}
@keyframes downloadToastMobileIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes downloadToastMobileOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(10px); }
}
@media (max-width: 520px) {
  dialog.download-password-dialog {
    width: calc(100vw - 22px);
    max-height: calc(100dvh - 28px);
    border-radius: 10px;
  }
  .download-password-head {
    gap: 11px;
    padding-top: 18px;
    padding-bottom: 15px;
  }
  .download-password-body {
    padding: 17px 18px 18px;
  }
  .download-password-panel {
    max-height: calc(100dvh - 28px);
    overflow-y: auto;
  }
  .download-password-head,
  .download-password-body {
    padding-left: 17px;
    padding-right: 17px;
  }
  .download-password-icon {
    flex-basis: 40px;
    width: 40px;
    height: 40px;
  }
  .download-password-title {
    padding-right: 34px;
    font-size: 18px;
  }
  .download-password-subtitle,
  .download-password-tip,
  .download-password-error {
    font-size: 12px;
  }
  .download-password-label {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
  .download-password-badge {
    max-width: 100%;
  }
  .download-password-input {
    height: 46px;
  }
  .download-password-actions {
    gap: 9px;
    margin-top: 12px;
  }
  .download-password-actions button {
    flex: 1;
    min-width: 0;
    min-height: 42px;
    padding: 0 10px;
  }
  .download-password-toast {
    top: auto;
    right: 14px;
    bottom: max(14px, env(safe-area-inset-bottom));
    left: 14px;
    justify-content: center;
    max-width: none;
    width: auto;
    padding: 12px 14px;
    transform: none;
    animation: downloadToastMobileIn .22s ease;
  }
  .download-password-toast.is-hide {
    animation: downloadToastMobileOut .22s ease forwards;
  }
}
</style>
<span class="download-button-wrap">
  <button type="button" class="download-button-trigger" aria-haspopup="dialog" aria-controls="${modalId}" title="${safeText}" onclick="${safeOpenDialogScript}">
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>${safeText}</span>
  </button>
</span>
<dialog class="download-password-dialog" id="${modalId}" onclick="if(event.target===this){this.close?this.close():this.removeAttribute('open');}">
  <form class="download-password-panel" data-download-cipher="${encryptedDownload.cipher}" data-download-salt="${encryptedDownload.salt}" data-download-iv="${encryptedDownload.iv}" data-download-iterations="${encryptedDownload.iterations}" onsubmit="${safeSubmitScript}">
    <div class="download-password-head">
      <div class="download-password-icon" aria-hidden="true"><i class="fas fa-key"></i></div>
      <div>
        <h3 class="download-password-title">输入下载密码</h3>
        <p class="download-password-subtitle">验证成功后会自动跳转到下载</p>
      </div>
      <button type="button" class="download-password-close" aria-label="关闭" onclick="var modal=this.closest('dialog');modal.close?modal.close():modal.removeAttribute('open');"><i class="fas fa-times" aria-hidden="true"></i></button>
    </div>
    <div class="download-password-body">
      <label class="download-password-label">
        <span>下载密码</span>
        <span class="download-password-badge">${safeText}</span>
      </label>
      <div class="download-password-field">
        <i class="fas fa-lock" aria-hidden="true"></i>
        <input class="download-password-input" type="text" autocomplete="off" placeholder="请输入下载密码" oninput="var form=this.closest('form');form.classList.remove('has-error');form.querySelector('.download-password-error').textContent='';">
      </div>
      <p class="download-password-tip"><i class="fas fa-wifi" aria-hidden="true"></i><span>直装通道下载请勿开梯子，否则可能没有响应</span></p>
      <div class="download-password-notice">
        <i class="fas fa-info-circle" aria-hidden="true"></i>
        <p>直链下载服务现已恢复。此前因直链被滥用，短时间内产生大量异常流量及高额费用，服务曾自 2026 年 8 月 5 日起暂停。为保障直链长期稳定运行，后续直装服务价格将适度上调。请勿外传直链、批量下载或使用多线程下载工具；若再次出现异常流量，服务可能临时限速或暂停。感谢理解与支持。</p>
      </div>
      <p class="download-password-error" role="alert"></p>
      <div class="download-password-actions">
        <button type="button" class="download-password-cancel" onclick="var modal=this.closest('dialog');modal.close?modal.close():modal.removeAttribute('open');"><i class="fas fa-times" aria-hidden="true"></i><span>取消</span></button>
        <button type="submit" class="download-password-submit"><i class="fas fa-check" aria-hidden="true"></i><span>验证下载</span></button>
      </div>
    </div>
  </form>
</dialog>
`;
}

hexo.extend.tag.register("downloadButton", downloadButton, { ends: false });
