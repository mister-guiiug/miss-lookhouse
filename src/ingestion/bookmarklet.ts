/**
 * « Capture navigateur » (mode `browser_capture`) — collecte RESPONSABLE : un
 * bookmarklet que l'utilisateur ajoute à ses favoris et clique sur une page
 * d'annonce qu'il consulte DANS SA PROPRE SESSION. Il extrait les champs
 * visibles (Open Graph + heuristique prix) et copie un JSON, à coller dans
 * l'écran « Importer » (le connecteur d'import manuel s'en charge ensuite).
 * Aucune aspiration automatisée, aucun contournement de protection.
 */

// Source lisible, exécutée sur la page du portail. `\\` => backslash littéral
// dans la chaîne produite (séquences regex/unicode pour le bookmarklet).
const SRC = `(function(){
try{
var meta=function(p){var m=document.querySelector('meta[property="'+p+'"]')||document.querySelector('meta[name="'+p+'"]');return m&&m.content?m.content:null;};
var host=location.hostname.replace(/^www\\./,'');
var source=host.indexOf('leboncoin')>=0?'leboncoin':host.indexOf('seloger')>=0?'seloger':host.indexOf('bienici')>=0?'bienici':host.indexOf('pap.fr')>=0?'pap':'import_generique';
var price=meta('og:price:amount')||meta('product:price:amount');
if(!price){var pm=document.body.innerText.match(/([0-9][0-9 .\\u00a0]{3,})\\s*\\u20ac/);price=pm?pm[1]:null;}
var img=meta('og:image');
var rec={source:source,url:location.href,title:meta('og:title')||document.title||null,description:meta('og:description')||null,price:price,mediaUrls:img?[img]:[]};
var json=JSON.stringify([rec],null,2);
var ok=function(){alert('Miss LookHouse : annonce copiee. Collez-la dans Importer.');};
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(ok,function(){window.prompt('Copiez ce JSON puis collez-le dans Miss LookHouse :',json);});}
else{window.prompt('Copiez ce JSON puis collez-le dans Miss LookHouse :',json);}
}catch(e){alert('Capture impossible sur cette page : '+e);}
})();`;

/** Code source (lisible) du bookmarklet. */
export const BOOKMARKLET_SRC = SRC;

/** href prêt à coller dans un favori / à glisser dans la barre de favoris. */
export const BOOKMARKLET_HREF =
  'javascript:' + encodeURIComponent(SRC.replace(/\n/g, ''));
