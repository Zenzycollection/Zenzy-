const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const axios = require('axios');
const adminOnly = require('../middleware/adminAuth');
const adminAuth = adminOnly.staff;
const Media = require('../models/Media');
const Article = require('../models/Article');
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>/^image\/(jpeg|png|webp)$/.test(file.mimetype)?cb(null,true):cb(new Error('Only JPG, PNG and WEBP images are allowed.'))});
router.post('/image',adminAuth,(req,res,next)=>upload.single('image')(req,res,err=>err?res.status(400).json({error:err.message}):next()),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'Choose an image first.'});const cloud=process.env.CLOUDINARY_CLOUD_NAME,key=process.env.CLOUDINARY_API_KEY,secret=process.env.CLOUDINARY_API_SECRET;if(!cloud||!key||!secret)return res.status(503).json({error:'Image hosting is not configured. Add Cloudinary credentials to .env.'});const timestamp=Math.floor(Date.now()/1000),folder='zenzy-collection';const signature=crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');const form=new URLSearchParams();form.append('file',`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`);form.append('api_key',key);form.append('timestamp',String(timestamp));form.append('folder',folder);form.append('signature',signature);const result=await axios.post(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`,form.toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'},maxBodyLength:10*1024*1024});const doc=await Media.create({url:result.data.secure_url,publicId:result.data.public_id,width:result.data.width,height:result.data.height,bytes:result.data.bytes||req.file.size,mimeType:req.file.mimetype,alt:String(req.body.alt||'').slice(0,200),originalName:String(req.file.originalname||'').slice(0,200)});res.status(201).json({id:doc._id,url:doc.url,publicId:doc.publicId,width:doc.width,height:doc.height});}catch(e){res.status(502).json({error:e.response?.data?.error?.message||'Image upload failed.'});}});
const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/admin/all', adminAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = 24;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const filter = q ? { $or: [{ alt: new RegExp(rxEsc(q), 'i') }, { originalName: new RegExp(rxEsc(q), 'i') }] } : {};
    const [items, total] = await Promise.all([
      Media.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Media.countDocuments(filter)
    ]);
    const used = await Promise.all(items.map(m => Article.countDocuments({ $or: [{ coverImage: m.url }, { content: { $regex: rxEsc(m.url) } }] })));
    res.json({ items: items.map((m, i) => ({ ...m, usedIn: used[i] })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

router.patch('/admin/:id', adminAuth, async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid image id.' });
    const doc = await Media.findByIdAndUpdate(req.params.id, { $set: { alt: String((req.body || {}).alt || '').trim().slice(0, 200) } }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Image not found.' });
    // keep articles that use this image as a cover in sync
    await Article.updateMany({ coverImage: doc.url }, { $set: { coverImageAlt: doc.alt } });
    res.json(doc);
  } catch (e) { next(e); }
});

router.delete('/admin/:id', adminAuth, async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid image id.' });
    const doc = await Media.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Image not found.' });
    const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
    if (cloud && key && secret && doc.publicId) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHash('sha1').update('public_id=' + doc.publicId + '&timestamp=' + timestamp + secret).digest('hex');
      const form = new URLSearchParams({ public_id: doc.publicId, api_key: key, timestamp: String(timestamp), signature });
      try { await axios.post('https://api.cloudinary.com/v1_1/' + cloud + '/image/destroy', form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); }
      catch (err) { console.error('Cloudinary delete failed:', err.message); }
    }
    await doc.deleteOne();
    res.json({ message: 'Image deleted.' });
  } catch (e) { next(e); }
});

module.exports=router;
