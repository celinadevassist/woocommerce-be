import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  Header,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../guards/throttle.guard';
import { PublicReviewService } from './public.service';
import { Store, StoreDocument } from '../store/schema';
import { ReviewType } from './enum';

@ApiTags('Public Reviews API')
@Controller('widget/store-reviews')
export class PublicReviewController {
  private readonly logger = new Logger(PublicReviewController.name);

  constructor(
    private readonly publicReviewService: PublicReviewService,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Validate store API key and return store ID
   */
  private async validateApiKey(apiKey: string): Promise<string> {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }

    const store = await this.storeModel.findOne({
      publicApiKey: apiKey,
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Invalid API key or store not found');
    }

    return store._id.toString();
  }

  @Get()
  @ApiOperation({ summary: 'Get published reviews (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiQuery({
    name: 'product_id',
    required: false,
    description: 'Filter by product ID',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ReviewType,
    description: 'Filter by review type',
  })
  @ApiQuery({
    name: 'featured',
    required: false,
    type: Boolean,
    description: 'Only featured reviews',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'rating', 'helpfulCount'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: 'Returns published reviews with pagination',
  })
  async getReviews(
    @Query('api_key') apiKey: string,
    @Query('product_id') productId?: string,
    @Query('type') reviewType?: ReviewType,
    @Query('featured') featured?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('sort_by') sortBy?: 'createdAt' | 'rating' | 'helpfulCount',
    @Query('sort_order') sortOrder?: 'asc' | 'desc',
  ) {
    this.logger.log(
      `Public reviews request received with api_key: ${apiKey?.substring(
        0,
        10,
      )}...`,
    );
    const storeId = await this.validateApiKey(apiKey);

    return this.publicReviewService.getPublishedReviews(storeId, {
      productId,
      reviewType,
      featured: featured === 'true',
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 10,
      sortBy,
      sortOrder,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get review summary statistics (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns review summary with counts and averages',
  })
  async getSummary(@Query('api_key') apiKey: string) {
    const storeId = await this.validateApiKey(apiKey);
    return this.publicReviewService.getPublicSummary(storeId);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured reviews (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of reviews (default: 5)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns featured reviews sorted by order',
  })
  async getFeaturedReviews(
    @Query('api_key') apiKey: string,
    @Query('limit') limit?: string,
  ) {
    const storeId = await this.validateApiKey(apiKey);

    return this.publicReviewService.getPublishedReviews(storeId, {
      featured: true,
      size: limit ? parseInt(limit, 10) : 5,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  @Post()
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a public review (rate limited)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reviewer', 'review', 'rating'],
      properties: {
        reviewer: { type: 'string', description: 'Reviewer name' },
        review: { type: 'string', description: 'Review content' },
        rating: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Rating 1-5',
        },
        email: { type: 'string', description: 'Reviewer email (optional)' },
        productId: {
          type: 'string',
          description: 'Local product ID (optional)',
        },
        productExternalId: {
          type: 'number',
          description: 'WooCommerce product ID (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Review submitted and pending moderation',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async submitReview(
    @Query('api_key') apiKey: string,
    @Body()
    body: {
      reviewer: string;
      review: string;
      rating: number;
      email?: string;
      productId?: string;
      productExternalId?: number;
    },
  ) {
    const storeId = await this.validateApiKey(apiKey);

    // Validate required fields
    if (!body.reviewer || !body.reviewer.trim()) {
      throw new BadRequestException('Reviewer name is required');
    }
    if (!body.review || !body.review.trim()) {
      throw new BadRequestException('Review content is required');
    }
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    return this.publicReviewService.createPublicReview(storeId, {
      reviewer: body.reviewer.trim(),
      review: body.review.trim(),
      rating: body.rating,
      email: body.email,
      productId: body.productId,
      productExternalId: body.productExternalId,
    });
  }

  @Get('embed.js')
  @ApiOperation({ summary: 'Get embeddable widget JavaScript' })
  @ApiResponse({
    status: 200,
    description: 'Returns widget JavaScript file',
  })
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Access-Control-Allow-Origin', '*')
  async getEmbedScript(@Res() res: Response) {
    const script = `(function(){
  var w=document.getElementById('cartflow-reviews-widget');
  if(!w)return;
  var d=w.dataset;
  var API_BASE=d.apiBase||'';
  var API_KEY=d.apiKey||'';
  if(!API_KEY){w.innerHTML='<p style="color:red;">CartFlow: Missing data-api-key</p>';return;}
  if(!API_BASE){
    var s=document.currentScript||document.querySelector('script[src*="embed.js"]');
    if(s&&s.src){var u=new URL(s.src);API_BASE=u.origin+'/api';}
    else{w.innerHTML='<p style="color:red;">CartFlow: Missing data-api-base</p>';return;}
  }
  var CONFIG={
    REVIEWS_PER_PAGE:parseInt(d.reviewsPerPage)||10,
    SHOW_HEADER:d.showHeader!=='false',
    SHOW_SUMMARY:d.showSummary!=='false',
    SHOW_CUSTOMER_NAME:d.showCustomerName!=='false',
    SHOW_RATING:d.showRating!=='false',
    SHOW_DATE:d.showDate!=='false',
    SHOW_VERIFIED:d.showVerified!=='false',
    SHOW_PRODUCT:d.showProduct!=='false',
    SHOW_PHOTOS:d.showPhotos!=='false',
    SHOW_REVIEW_TEXT:d.showReviewText!=='false',
    SHOW_LOAD_MORE:d.showLoadMore!=='false',
    HEADER_TITLE:d.headerTitle||'What Our Customers Say'
  };
  var currentPage=1,totalPages=1,summary=null;
  function stars(r){return '\\u2605'.repeat(Math.round(r))+'\\u2606'.repeat(5-Math.round(r));}
  function initials(n){return n?n.split(' ').map(function(x){return x[0];}).join('').toUpperCase().slice(0,2):'?';}
  function fmtDate(dt){return new Date(dt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});}
  function esc(str){if(!str)return '';var div=document.createElement('div');div.textContent=str;return div.innerHTML;}
  function san(str){
    if(!str)return '';
    var allowed={P:1,BR:1,STRONG:1,EM:1,B:1,I:1,U:1,UL:1,OL:1,LI:1,A:1,BLOCKQUOTE:1,SPAN:1};
    var doc=new DOMParser().parseFromString(str,'text/html');
    function cl(node){
      var out='';
      node.childNodes.forEach(function(c){
        if(c.nodeType===3){out+=esc(c.textContent);}
        else if(c.nodeType===1){
          var t=c.tagName;
          if(allowed[t]){
            var a='';
            if(t==='A'&&c.getAttribute('href')){
              var h=c.getAttribute('href');
              if(/^https?:\\/\\//i.test(h)){a=' href="'+esc(h)+'" target="_blank" rel="noopener noreferrer"';}
            }
            out+='<'+t.toLowerCase()+a+'>'+cl(c)+'</'+t.toLowerCase()+'>';
          }else{out+=cl(c);}
        }
      });
      return out;
    }
    return cl(doc.body);
  }
  var css=\`
.cfr-container{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:1200px;margin:0 auto}
.cfr-header{text-align:center;margin-bottom:24px}
.cfr-header h2{font-size:32px;margin:0 0 10px 0;color:#1a1a1a}
.cfr-summary{display:flex;align-items:center;justify-content:center;gap:15px;margin:20px 0}
.cfr-big-rating{font-size:56px;font-weight:700;color:#1a1a1a;line-height:1}
.cfr-stars-large{color:#FFB800;font-size:28px;letter-spacing:2px}
.cfr-review-count{color:#666;font-size:14px;margin-top:5px}
.cfr-reviews-list{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:1024px){.cfr-reviews-list{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.cfr-reviews-list{grid-template-columns:1fr}}
.cfr-review{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;transition:box-shadow .2s,transform .2s}
.cfr-review:hover{box-shadow:0 4px 12px rgba(0,0,0,.08);transform:translateY(-2px)}
.cfr-review-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.cfr-reviewer{display:flex;align-items:center;gap:12px}
.cfr-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px}
.cfr-product-img{width:50px;height:50px;border-radius:8px;object-fit:cover;border:1px solid #e5e5e5}
.cfr-name{font-weight:600;color:#1a1a1a;font-size:15px}
.cfr-verified{display:inline-flex;align-items:center;gap:4px;background:#e8f5e9;color:#2e7d32;font-size:11px;padding:3px 8px;border-radius:12px;margin-left:8px}
.cfr-product{color:#666;font-size:13px;margin-top:2px}
.cfr-meta{text-align:right}
.cfr-stars{color:#FFB800;font-size:16px;letter-spacing:1px}
.cfr-date{color:#666;font-size:12px;margin-top:4px}
.cfr-content{color:#1a1a1a;line-height:1.7;font-size:15px}
.cfr-content p{margin:0 0 .5em 0}.cfr-content p:last-child{margin-bottom:0}
.cfr-photos{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.cfr-photo{width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid #e5e5e5;cursor:pointer;transition:transform .2s}
.cfr-photo:hover{transform:scale(1.05);box-shadow:0 4px 12px rgba(0,0,0,.15)}
.cfr-load-more{text-align:center;margin-top:30px}
.cfr-load-more button{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.cfr-load-more button:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(102,126,234,.4)}
.cfr-loading{text-align:center;padding:60px 20px;color:#666}
.cfr-error{text-align:center;padding:40px;background:#ffebee;border-radius:12px;color:#c62828}
\`;
  var style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  function renderReview(r){
    var hasProduct=CONFIG.SHOW_PRODUCT&&r.product&&r.product.name;
    var productImage=CONFIG.SHOW_PRODUCT&&r.product&&r.product.image;
    var photos=CONFIG.SHOW_PHOTOS&&r.photos?r.photos:[];
    var photosHtml='';
    if(photos.length>0){
      photosHtml='<div class="cfr-photos">'+photos.filter(function(p){return /^https?:\\/\\//i.test(p.url||p);}).map(function(p){var src=p.url||p;return '<img class="cfr-photo" src="'+src+'" alt="Review photo" onclick="window.open(\\''+src+'\\',\\'_blank\\')" />';}).join('')+'</div>';
    }
    return '<div class="cfr-review"><div class="cfr-review-header"><div class="cfr-reviewer">'
      +(productImage?'<img class="cfr-product-img" src="'+productImage+'" alt="'+esc(r.product.name)+'" />':(CONFIG.SHOW_CUSTOMER_NAME?'<div class="cfr-avatar">'+initials(r.reviewer)+'</div>':''))
      +'<div>'
      +((CONFIG.SHOW_PRODUCT||CONFIG.SHOW_CUSTOMER_NAME)?'<span class="cfr-name">'+(hasProduct?esc(r.product.name):(CONFIG.SHOW_CUSTOMER_NAME?esc(r.reviewer||'Customer'):''))+'</span>':'')
      +(CONFIG.SHOW_VERIFIED&&r.verified?'<span class="cfr-verified">\\u2713 Verified</span>':'')
      +(hasProduct&&CONFIG.SHOW_CUSTOMER_NAME?'<div class="cfr-product">by '+esc(r.reviewer||'Customer')+'</div>':'')
      +'</div></div><div class="cfr-meta">'
      +(CONFIG.SHOW_RATING?'<div class="cfr-stars">'+stars(r.rating)+'</div>':'')
      +(CONFIG.SHOW_DATE?'<div class="cfr-date">'+fmtDate(r.wooCreatedAt||r.createdAt)+'</div>':'')
      +'</div></div>'
      +(CONFIG.SHOW_REVIEW_TEXT?'<div class="cfr-content">'+san(r.review||'')+'</div>':'')
      +photosHtml+'</div>';
  }
  function loadReviews(){
    w.innerHTML='<div class="cfr-loading">Loading reviews...</div>';
    Promise.all([
      fetch(API_BASE+'/widget/store-reviews/summary?api_key='+API_KEY),
      fetch(API_BASE+'/widget/store-reviews?api_key='+API_KEY+'&page=1&size='+CONFIG.REVIEWS_PER_PAGE)
    ]).then(function(res){
      if(!res[0].ok||!res[1].ok)throw new Error('API error');
      return Promise.all([res[0].json(),res[1].json()]);
    }).then(function(data){
      summary=data[0];var revData=data[1];
      totalPages=revData.pagination&&revData.pagination.totalPages||1;
      var html='<div class="cfr-container">';
      if(CONFIG.SHOW_HEADER){
        html+='<div class="cfr-header"><h2>'+esc(CONFIG.HEADER_TITLE)+'</h2>';
        if(CONFIG.SHOW_SUMMARY){
          html+='<div class="cfr-summary"><span class="cfr-big-rating">'+(summary.averageRating||0).toFixed(1)+'</span><div><div class="cfr-stars-large">'+stars(summary.averageRating||0)+'</div><div class="cfr-review-count">Based on '+(summary.totalReviews||0)+' reviews</div></div></div>';
        }
        html+='</div>';
      }
      html+='<div id="cfr-reviews-list" class="cfr-reviews-list">';
      (revData.reviews||[]).forEach(function(r){html+=renderReview(r);});
      html+='</div>';
      if(CONFIG.SHOW_LOAD_MORE&&totalPages>1){
        html+='<div class="cfr-load-more"><button id="cfr-load-more-btn">Load More</button></div>';
      }
      html+='</div>';
      w.innerHTML=html;
      var btn=document.getElementById('cfr-load-more-btn');
      if(btn)btn.addEventListener('click',loadMore);
    }).catch(function(){
      w.innerHTML='<div class="cfr-error">Unable to load reviews.</div>';
    });
  }
  function loadMore(){
    if(currentPage>=totalPages)return;
    currentPage++;
    var btn=document.getElementById('cfr-load-more-btn');
    if(btn)btn.textContent='Loading...';
    fetch(API_BASE+'/widget/store-reviews?api_key='+API_KEY+'&page='+currentPage+'&size='+CONFIG.REVIEWS_PER_PAGE)
    .then(function(r){return r.json();})
    .then(function(data){
      var list=document.getElementById('cfr-reviews-list');
      (data.reviews||[]).forEach(function(r){list.insertAdjacentHTML('beforeend',renderReview(r));});
      if(currentPage>=totalPages){var lm=document.querySelector('.cfr-load-more');if(lm)lm.style.display='none';}
      else if(btn)btn.textContent='Load More';
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',loadReviews);}else{loadReviews();}
})();`;

    res.send(script);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review by ID (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiResponse({ status: 200, description: 'Returns review details' })
  async getReview(@Param('id') id: string, @Query('api_key') apiKey: string) {
    const storeId = await this.validateApiKey(apiKey);

    // Get the review - it must be published and approved
    const result = await this.publicReviewService.getPublishedReviews(storeId, {
      page: 1,
      size: 1,
    });

    // Find the specific review by filtering from published reviews
    // Note: For performance, we might want to add a getPublicReviewById method
    const allReviews = await this.publicReviewService.getPublishedReviews(
      storeId,
      {
        size: 1000, // Fetch more to find the specific one
      },
    );

    const review = allReviews.reviews.find((r) => r._id === id);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Increment view count
    await this.publicReviewService.incrementViewCount(id);

    return review;
  }

  @Post(':id/helpful')
  @ApiOperation({ summary: 'Mark a review as helpful (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiResponse({ status: 200, description: 'Helpful count incremented' })
  async markHelpful(@Param('id') id: string, @Query('api_key') apiKey: string) {
    await this.validateApiKey(apiKey);
    await this.publicReviewService.incrementHelpful(id);
    return { success: true, message: 'Marked as helpful' };
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get reviews for a specific product (public)' })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'Store public API key',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns product reviews with pagination',
  })
  async getProductReviews(
    @Param('productId') productId: string,
    @Query('api_key') apiKey: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const storeId = await this.validateApiKey(apiKey);

    return this.publicReviewService.getPublishedReviews(storeId, {
      productId,
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }
}
