"""Unit-aware calculations, uncertainty budgets and established SciPy solvers."""
import warnings
import numpy as np
from scipy import optimize, odr, stats, signal, integrate, interpolate
from .expressions import Expression, CONSTANTS, Q, unit, magnitude, array, derivative, clean, symbol_ok

MAX_ROWS=20000
MAX_COLUMNS=40
MODELS={
 'linear':('Linear','a*x+b',[('a','y/x'),('b','y')]),
 'quadratic':('Quadratic','a*x^2+b*x+c0',[('a','y/x^2'),('b','y/x'),('c0','y')]),
 'cubic':('Cubic','a*x^3+b*x^2+c0*x+d',[('a','y/x^3'),('b','y/x^2'),('c0','y/x'),('d','y')]),
 'decay':('Exponential decay / RC discharge','A*exp(-x/tau)+b',[('A','y'),('tau','x'),('b','y')]),
 'exponential':('Exponential growth','A*exp(k*x)+b',[('A','y'),('k','1/x'),('b','y')]),
 'power':('Power law','A*(x/x0)^n+b',[('A','y'),('x0','x'),('n',''),('b','y')]),
 'logarithmic':('Logarithmic','A*log(x/x0)+b',[('A','y'),('x0','x'),('b','y')]),
 'sine':('Sinusoid / SHM','A*sin(2*pi*f*x+phi)+b',[('A','y'),('f','1/x'),('phi',''),('b','y')]),
 'damped':('Damped oscillation','A*exp(-x/tau)*cos(2*pi*f*x+phi)+b',[('A','y'),('tau','x'),('f','1/x'),('phi',''),('b','y')]),
 'gaussian':('Gaussian peak','A*exp(-(x-mu)^2/(2*sigma^2))+b',[('A','y'),('mu','x'),('sigma','x'),('b','y')]),
 'lorentzian':('Lorentzian peak','A/(1+((x-x0)/gamma)^2)+b',[('A','y'),('x0','x'),('gamma','x'),('b','y')]),
 'charge':('RC / RL rise','A*(1-exp(-x/tau))+b',[('A','y'),('tau','x'),('b','y')]),
 'lowpass':('Low-pass response','A/sqrt(1+(x/fc)^2)',[('A','y'),('fc','x')]),
 'highpass':('High-pass response','A*(x/fc)/sqrt(1+(x/fc)^2)',[('A','y'),('fc','x')]),
 'resonance':('Driven oscillator / RLC','A/sqrt((1-(x/f0)^2)^2+(x/(Qf*f0))^2)',[('A','y'),('f0','x'),('Qf','')]),
 'inverse_square':('Inverse square','A/x^2+b',[('A','y*x^2'),('b','y')]),
 'malus':('Malus law','A*cos(x-phi)^2+b',[('A','y'),('phi','x'),('b','y')]),
 'custom':('Your equation','a*x+b',[('a','y/x'),('b','y')])}

def validate_sheet(s):
    if not isinstance(s,dict) or not isinstance(s.get('columns'),list) or not isinstance(s.get('rows'),list):raise ValueError('A dataset needs columns and rows.')
    if not 1<=len(s['columns'])<=MAX_COLUMNS or len(s['rows'])>MAX_ROWS:raise ValueError(f'Use 1–{MAX_COLUMNS} columns and at most {MAX_ROWS:,} rows per dataset.')
    names=set(CONSTANTS)
    for c in s['columns']+s.get('constants',[]):
        k=c.get('key','')
        if not symbol_ok(k) or k in names:raise ValueError(f"Symbol '{k}' is invalid, repeated, or reserved for a scientific constant.")
        names.add(k);unit(c.get('unit',''))
        if c.get('formula'):Expression(c['formula'])
    for r in s['rows']:
        if not isinstance(r,dict) or not isinstance(r.get('values',{}),dict) or not isinstance(r.get('uncertainties',{}),dict):raise ValueError('Each row needs value and uncertainty objects.')

def number(v):
    if v is None or str(v).strip()=='':return np.nan
    try:f=float(v);return f if np.isfinite(f) else np.nan
    except (ValueError,TypeError):return np.nan

def correlations(names,pairs):
    mat=np.eye(len(names))
    for p in pairs:
        if p.get('a') not in names or p.get('b') not in names or p['a']==p['b']:raise ValueError('Correlations must name two distinct raw inputs or custom constants.')
        rho=float(p['rho'])
        if not np.isfinite(rho) or abs(rho)>1:raise ValueError('Correlation coefficients must be between -1 and 1.')
        i,j=names.index(p['a']),names.index(p['b']);mat[i,j]=mat[j,i]=rho
    if names and np.linalg.eigvalsh(mat).min()<-1e-10:raise ValueError('The correlation matrix must be positive semidefinite.')
    return mat

def calculate(s):
    validate_sheet(s);n=len(s['rows']);raw={};us={};units={};exprs={};values={};uncertainties={};deps={};problems=[];budgets={}
    for k,(v,un,u) in CONSTANTS.items():raw[k]=v;us[k]=u;units[k]=un
    for c in s.get('constants',[]):
        v,u=number(c.get('value')),number(c.get('uncertainty',0))
        if not np.isfinite(v) or not np.isfinite(u) or u<0:raise ValueError(f"Constant {c['key']} needs a finite value and nonnegative standard uncertainty.")
        k=c['key'];raw[k]=v;us[k]=u;units[k]=c.get('unit','')
    for c in s['columns']:
        k=c['key'];units[k]=c.get('unit','')
        if c.get('formula'):exprs[k]=Expression(c['formula']);continue
        v=np.array([number(r.get('values',{}).get(k)) for r in s['rows']]);default=number(c.get('uncertainty'));mode=c.get('uncertaintyMode','absolute');u=np.full(n,default)
        if mode=='percent':u=np.abs(v)*default/100
        elif mode=='relative':u=np.abs(v)*default
        elif mode=='resolution':u/=np.sqrt(12)
        elif mode=='bound':u/=np.sqrt(3)
        if c.get('uncertaintyColumn'):
            src=next((z for z in s['columns'] if z['key']==c['uncertaintyColumn'] and not z.get('formula')),None)
            if not src or src['key']==k:raise ValueError(f'{k}: choose a different raw uncertainty column.')
            u=magnitude(Q([number(r.get('values',{}).get(src['key'])) for r in s['rows']],unit(src.get('unit',''))),unit(units[k]))
        for i,r in enumerate(s['rows']):
            override=r.get('uncertainties',{}).get(k)
            if override is not None and str(override).strip():u[i]=number(override)
        if np.any(u<0):problems.append(f'{k}: negative uncertainties are invalid and treated as missing.');u[u<0]=np.nan
        invalid=[i+1 for i,r in enumerate(s['rows']) if str(r.get('values',{}).get(k,'')).strip() and not np.isfinite(v[i])]
        if invalid:problems.append(f'{k}: nonnumeric values in rows '+', '.join(map(str,invalid[:8]))+'.')
        raw[k]=v;us[k]=u;values[k]=v;uncertainties[k]=u;deps[k]={k}
    def evaluate(k,overrides=None,seen=None,cache=None):
        seen=set() if seen is None else seen;cache={} if cache is None else cache
        if k in cache:return cache[k]
        if k in raw:return Q((overrides or {}).get(k,raw[k]),unit(units[k]))
        if k not in exprs:raise ValueError(f"Unknown symbol '{k}'.")
        if k in seen:raise ValueError('Circular formula reference.')
        q=exprs[k]({x:evaluate(x,overrides,seen|{k},cache) for x in exprs[k].names});q=q if isinstance(q,Q) else Q(q,'')
        if units[k]:q=q.to(unit(units[k]))
        cache[k]=q;return q
    def leaves(k,seen=None):
        if k in raw:return {k}
        if k not in exprs:raise ValueError(f"Unknown symbol '{k}'.")
        seen=set() if seen is None else seen
        if k in seen:raise ValueError('Circular formula reference.')
        return set().union(*(leaves(x,seen|{k}) for x in exprs[k].names))
    cn=[c['key'] for c in s['columns'] if not c.get('formula')]+[c['key'] for c in s.get('constants',[])];cm=correlations(cn,s.get('correlations',[]))
    for k in exprs:
        try:
            q=evaluate(k);values[k]=array(q.magnitude,n);units[k]=units[k] or str(q.units);sources=sorted(leaves(k));deps[k]=set(sources);derivs={};components=[]
            for source in sources:
                d=array(derivative(lambda z:magnitude(evaluate(k,{source:z}),units[k]),raw[source],np.nan_to_num(us[source])),n)
                derivs[source]=d;components.append(np.where(d==0,0,d*us[source]))
            variance=sum((x*x for x in components),np.zeros(n))
            for i,ka in enumerate(sources):
                for j,kb in enumerate(sources[:i]):
                    if ka in cn and kb in cn:
                        rho=cm[cn.index(ka),cn.index(kb)]
                        if rho:variance+=2*rho*components[i]*components[j]
            uncertainties[k]=np.sqrt(np.maximum(variance,0));budgets[k]={'formula':exprs[k].source,'sensitivities':derivs,'sourceUncertainties':{z:array(us[z],n) for z in sources},'method':'First-order propagation: u² = J Σ Jᵀ. Central finite-difference sensitivities include shared source dependencies.'}
            if np.any(~np.isfinite(values[k])):problems.append(f'{k}: {sum(~np.isfinite(values[k]))} row(s) have missing inputs or undefined formula values.')
        except Exception as e:values[k]=np.full(n,np.nan);uncertainties[k]=np.full(n,np.nan);problems.append(f'{k}: {str(e)[:240]}')
    return {'values':values,'uncertainties':uncertainties,'units':units,'problems':problems,'budgets':budgets,'dependencies':deps,'raw':raw,'source_u':us}

def summary(v,u=None):
    ok=np.isfinite(v);a=np.asarray(v)[ok];n=len(a)
    if not n:return {'n':0,'missing':len(v)}
    sd=np.std(a,ddof=1) if n>1 else np.nan;sem=sd/np.sqrt(n);half=stats.t.ppf(.975,n-1)*sem if n>1 else np.nan
    r={'n':n,'missing':len(v)-n,'mean':a.mean(),'median':np.median(a),'sd':sd,'variance':sd**2,'sem':sem,'min':min(a),'max':max(a),'q25':np.percentile(a,25),'q75':np.percentile(a,75),'ci95':[a.mean()-half,a.mean()+half]}
    if u is not None and np.all(np.isfinite(u[ok])&(u[ok]>0)):
        w=1/u[ok]**2;r.update(weightedMean=np.sum(w*a)/sum(w),weightedUncertainty=1/np.sqrt(sum(w)))
    return r

def model_defaults(s,model):
    d=calculate(s);p=s['plot'];xk,yk=p['x'],p['y'];xu,yu=unit(d['units'][xk]),unit(d['units'][yk]);x,y=d['values'][xk],d['values'][yk];ok=np.isfinite(x)&np.isfinite(y);x,y=x[ok],y[ok];span=float(np.ptp(x)) if len(x)>1 and np.ptp(x)>0 else 1;amp=float(np.ptp(y)) if len(y)>1 and np.ptp(y)>0 else 1;offset=float(min(y)) if len(y) else 0
    slope=float(np.polyfit(x,y,1)[0]) if len(x)>1 and np.ptp(x)>0 else 1
    g={'a':slope,'b':offset,'c0':0,'d':0,'A':amp,'tau':span/3,'k':1/span,'x0':1,'n':1,'f':1/span,'phi':0,'mu':float(x[np.argmax(y)]) if len(x) else 0,'sigma':span/6,'gamma':span/6,'fc':float(np.median(x)) if len(x) else 1,'f0':float(x[np.argmax(y)]) if len(x) else 1,'Qf':2}
    _,expression,spec=MODELS.get(model,MODELS['linear']);params=[]
    for k,dim in spec:
        q=Expression(dim)({'x':Q(1,xu),'y':Q(1,yu)}) if dim else Q(1,'')
        params.append({'name':k,'value':g[k],'unit':str(q.units),'lower':1e-15 if k in ('tau','sigma','gamma','fc','f0','Qf') else '','upper':'','fixed':k=='x0' and model in ('power','logarithmic')})
    return {'model':model,'expression':expression,'params':params,'method':'ols','enabled':False}

def make_model(cfg,d,xk,yk):
    expr=Expression(cfg.get('expression','a*x+b'));params=cfg.get('params',[]);names=[p.get('name','') for p in params]
    if len(params)>12 or len(set(names))!=len(names) or any(not symbol_ok(n) or n in CONSTANTS or n in ('x',xk) for n in names):raise ValueError('Use at most 12 unique parameters, distinct from x and scientific constants.')
    base={k:Q(v,un) for k,(v,un,u) in CONSTANTS.items()}
    for k,v in d['raw'].items():
        if np.ndim(v)==0:base[k]=Q(v,d['units'][k])
    for p in params:
        if not np.isfinite(number(p.get('value'))):raise ValueError(f"Set an initial value for {p['name']}.")
        unit(p.get('unit',''))
    def f(x,*numbers):
        scope=dict(base);scope['x']=scope[xk]=Q(x,unit(d['units'][xk]));scope.update({p['name']:Q(v,unit(p.get('unit',''))) for p,v in zip(params,numbers)})
        return array(magnitude(expr(scope),unit(d['units'][yk])),len(np.atleast_1d(x)))
    return f,params

def fit_data(s,d,mask):
    cfg=s['fit'];xk,yk=s['plot']['x'],s['plot']['y'];x,y=d['values'][xk][mask],d['values'][yk][mask];sx,sy=d['uncertainties'][xk][mask],d['uncertainties'][yk][mask];f,params=make_model(cfg,d,xk,yk);free=[i for i,p in enumerate(params) if not p.get('fixed')]
    if not free:raise ValueError('Choose a free parameter, or use Theory for a fixed prediction.')
    if len(x)<=len(free):raise ValueError('Need more valid points than free parameters to estimate uncertainty.')
    if np.ptp(x)==0:raise ValueError('X values are all equal; the curve is not identifiable.')
    initial=np.array([float(p['value']) for p in params])
    def full(beta):v=initial.copy();v[free]=beta;return v
    def model(t,*beta):return f(t,*full(beta))
    if not np.all(np.isfinite(model(x,*initial[free]))):raise ValueError('The model is undefined at the initial guesses. Check its domain.')
    method=cfg.get('method','ols');notices=[]
    if method not in ('ols','wls','odr'):raise ValueError('Unknown fit method.')
    if method in ('wls','odr') and not np.all(np.isfinite(sy)&(sy>0)):raise ValueError('Weighted fitting requires positive standard Y uncertainty on every included point.')
    if method=='odr' and not np.all(np.isfinite(sx)&(sx>0)):raise ValueError('ODR requires positive standard X and Y uncertainty on every included point.')
    lower=[float(params[i]['lower']) if str(params[i].get('lower','')) else -np.inf for i in free];upper=[float(params[i]['upper']) if str(params[i].get('upper','')) else np.inf for i in free]
    if method=='odr':
        if any(np.isfinite(lower)) or any(np.isfinite(upper)):raise ValueError('ODR does not support bounds here. Clear bounds or choose least squares.')
        out=odr.ODR(odr.RealData(x,y,sx=sx,sy=sy),odr.Model(lambda b,t:model(t,*b)),beta0=initial[free],maxit=500).run()
        if out.info not in (1,2,3):raise ValueError('ODR did not converge: '+'; '.join(out.stopreason))
        beta,cov,chi2=out.beta,out.cov_beta,float(out.sum_square);notices.append('ODR assumes independent X/Y standard uncertainties. Displayed residuals are vertical, not orthogonal distances.')
    else:
        with warnings.catch_warnings(record=True) as caught:
            beta,cov=optimize.curve_fit(model,x,y,p0=initial[free],sigma=sy if method=='wls' else None,absolute_sigma=method=='wls',bounds=(lower,upper),method='trf',x_scale='jac',max_nfev=3000)
            notices.extend(str(w.message) for w in caught)
        chi2=float(sum(((y-model(x,*beta))/sy)**2)) if method=='wls' else None
    residual=y-model(x,*beta);dof=len(y)-len(free);grid=np.linspace(min(x),max(x),300);curve=model(grid,*beta);se=np.sqrt(np.maximum(np.diag(cov),0));jac=[]
    for j in range(len(beta)):
        def perturb(z):b=beta.copy();b[j]=z;return model(grid,*b)
        jac.append(derivative(perturb,beta[j]))
    J=np.column_stack(jac)
    if np.all(np.isfinite(cov)):
        band=np.sqrt(np.maximum(np.einsum('ij,jk,ik->i',J,cov,J),0))
        if np.linalg.cond(cov)>1e12:notices.append('Ill-conditioned parameter covariance. Rescale, simplify or fix parameters before trusting uncertainties.')
    else:band=np.full(len(grid),np.nan);notices.append('Parameter covariance could not be estimated reliably.')
    factor=stats.norm.ppf(.975) if method in ('wls','odr') else stats.t.ppf(.975,dof);est=full(beta);result=[]
    for i,p in enumerate(params):
        u=se[free.index(i)] if i in free else None;result.append({**p,'value':est[i],'stderr':u,'ci95':[est[i]-factor*u,est[i]+factor*u] if u is not None else None})
    if method=='ols':notices.append('Unweighted fit: parameter uncertainty comes from residual scatter, not measurement uncertainties.')
    if method!='odr' and np.any(np.isfinite(sx)&(sx>0)):notices.append('X error bars are shown but this fit treats X as exact. Use ODR if X uncertainty matters.')
    if d['dependencies'].get(xk,set())&d['dependencies'].get(yk,set()):notices.append('X and Y share measured inputs. These fits do not account for X–Y covariance.')
    if any(np.ndim(v)==0 and d['source_u'][k]>0 and (k in d['dependencies'].get(yk,set()) or k in Expression(cfg['expression']).names) for k,v in d['raw'].items()):notices.append('Shared uncertain constants can correlate rows. This fit uses diagonal errors and conditions on fixed constants; shared systematic uncertainty is not included in parameter covariance.')
    if len(x)>=6 and np.std(residual)>0:
        rho,pval=stats.spearmanr(x,residual)
        if np.isfinite(pval) and pval<.05:notices.append('Residuals show a monotonic trend (exploratory check). Inspect model, drift and calibration.')
    if any((np.isfinite(lo) and np.isclose(b,lo,rtol=1e-5,atol=1e-12)) or (np.isfinite(hi) and np.isclose(b,hi,rtol=1e-5,atol=1e-12)) for b,lo,hi in zip(beta,lower,upper)):notices.append('A parameter is near a bound. Covariance-based confidence intervals may be misleading.')
    denom=np.outer(se,se);corr=np.divide(cov,denom,out=np.full_like(cov,np.nan),where=denom>0);total=sum((y-y.mean())**2)
    with np.errstate(all='ignore'):normalized=residual/sy
    return {'params':result,'covariance':cov,'correlation':corr,'freeNames':[params[i]['name'] for i in free],'n':len(y),'dof':dof,'rmse':np.sqrt(np.mean(residual**2)),'r2':1-sum(residual**2)/total if total>0 else None,'chi2':chi2,'reducedChi2':chi2/dof if chi2 is not None else None,'pValue':stats.chi2.sf(chi2,dof) if chi2 is not None else None,'x':x,'observed':y,'sigma':sy,'residuals':residual,'normalized':normalized,'predicted':model(x,*beta),'grid':grid,'curve':curve,'lower':curve-factor*band,'upper':curve+factor*band,'warnings':notices,'method':method,'expression':cfg['expression']}

def analyze(s):
    d=calculate(s);p=s.get('plot',{});xk,yk=p.get('x'),p.get('y');inc=np.array([r.get('included',True) for r in s['rows']],dtype=bool)
    a={'values':d['values'],'uncertainties':d['uncertainties'],'units':{k:d['units'][k] for k in d['values']},'budgets':d['budgets'],'diagnostics':d['problems'],'stats':{k:summary(v[inc],d['uncertainties'][k][inc]) for k,v in d['values'].items()},'fit':None,'theory':None}
    if xk not in d['values'] or yk not in d['values']:a['diagnostics'].append('Choose X and Y columns.');return clean(a)
    mask=inc&np.isfinite(d['values'][xk])&np.isfinite(d['values'][yk]);a['indices']=np.flatnonzero(mask);a['omitted']=int(sum(inc&~mask))
    if a['omitted']:a['diagnostics'].append(f"{a['omitted']} included row(s) lack valid X/Y and cannot enter this graph or fit. Raw entries remain.")
    if sum(mask)<5:a['diagnostics'].append('Fewer than five valid points. Fit diagnostics may be weak.')
    for k in (xk,yk):
        v,u=d['values'][k][mask],d['uncertainties'][k][mask]
        if np.any(~np.isfinite(u)):a['diagnostics'].append(f'{k}: some uncertainties are missing; none have been invented.')
        if np.any((v!=0)&(u>abs(v)*.2)):a['diagnostics'].append(f'{k}: relative uncertainty exceeds 20% on some points. First-order propagation may be inaccurate.')
        if p.get('xScale' if k==xk else 'yScale')=='log' and np.any(v<=0):a['diagnostics'].append(f'{k}: log axes cannot display nonpositive values. Fits still use every finite included point.')
    if s.get('fit',{}).get('enabled'):
        try:a['fit']=fit_data(s,d,mask);a['diagnostics']+=a['fit']['warnings']
        except Exception as e:a['fitError']=str(e)[:400]
    if s.get('theory',{}).get('enabled') and mask.sum():
        try:
            f,params=make_model(s['theory'],d,xk,yk);vals=[float(p['value']) for p in params];x,y=d['values'][xk][mask],d['values'][yk][mask];pred=f(x,*vals);grid=np.linspace(min(x),max(x),300)
            if not np.all(np.isfinite(pred)):raise ValueError('Theory is undefined at measured X values. Check the equation domain.')
            res=y-pred;a['theory']={'x':x,'observed':y,'predicted':pred,'residuals':res,'percentDeviation':np.divide(100*res,pred,out=np.full_like(res,np.nan),where=pred!=0),'grid':grid,'curve':f(grid,*vals),'rmse':np.sqrt(np.mean(res**2)),'note':'Fixed entered constants. Their uncertainty is not included in this theory overlay.'}
        except Exception as e:a['theoryError']=str(e)[:400]
    if p.get('kind')=='contour':
        try:
            zk=p.get('z',s['columns'][-1]['key']);ok=mask&np.isfinite(d['values'][zk]);x,y,z=d['values'][xk][ok],d['values'][yk][ok],d['values'][zk][ok];gx,gy=np.linspace(min(x),max(x),70),np.linspace(min(y),max(y),70);X,Y=np.meshgrid(gx,gy);Z=interpolate.griddata(np.column_stack([x,y]),z,(X,Y),method='linear');a['map']={'x':gx,'y':gy,'z':Z};a['diagnostics'].append('Contours linearly interpolate inside the sample convex hull. They are not a field-equation solution; interpolation uncertainty is not estimated.')
        except Exception:a['diagnostics'].append('Contours need at least three distinct, non-collinear X/Y/Z measurements.')
    return clean(a)

def repeated(s,group,target,instrument=0):
    d=calculate(s);instrument=float(instrument)
    if group not in d['values'] or target not in d['values']:raise ValueError('Choose grouping and measurement columns.')
    if instrument<0 or not np.isfinite(instrument):raise ValueError('Instrument standard uncertainty must be nonnegative.')
    rows=[];inc=np.array([r.get('included',True) for r in s['rows']])
    for v in np.unique(d['values'][group][np.isfinite(d['values'][group])&inc]):
        st=summary(d['values'][target][(d['values'][group]==v)&inc]);rows.append({'group':v,**st,'combined':np.hypot(st.get('sem',np.nan),instrument)})
    return clean({'rows':rows,'note':'Groups use exact X equality. SEM = sample SD/√n. Combined u = √(SEM² + instrument u²); the instrumental component is shared and is not divided by √n. A single trial has no estimated SEM.'})

def signal_analysis(s,operation,window=7):
    d=calculate(s);xk,yk=s['plot']['x'],s['plot']['y'];inc=np.array([r.get('included',True) for r in s['rows']]);x,y=d['values'][xk][inc],d['values'][yk][inc]
    if len(x)<4 or not np.all(np.isfinite(x)&np.isfinite(y)):raise ValueError('Signal tools need four finite included pairs. Explicitly exclude invalid rows first.')
    if np.any(np.diff(x)<=0):raise ValueError('X must increase strictly. Create a sorted copy if needed.')
    xu,yu=d['units'][xk],d['units'][yk]
    if operation in ('fft','spectrum'):
        dt=np.diff(x)
        if not np.allclose(dt,dt.mean(),rtol=.001,atol=1e-12):raise ValueError('FFT requires uniform sampling within 0.1%. Resample deliberately first.')
        if operation=='spectrum':xx,yy=signal.periodogram(y,fs=1/dt.mean(),window='hann',detrend='constant',scaling='density');yu=str(unit(yu)**2*unit(xu))
        else:
            xx=np.fft.rfftfreq(len(y),dt.mean());yy=2*abs(np.fft.rfft(y-y.mean()))/len(y);yy[0]/=2
            if len(y)%2==0:yy[-1]/=2
        xu=str(1/unit(xu));note='Mean removed. FFT amplitude uses a rectangular window; PSD uses a Hann window and density scaling.'
    elif operation=='derivative':xx,yy=x,np.gradient(y,x,edge_order=2);yu=str(unit(yu)/unit(xu));note='Numerical gradient with second-order edge differences; noise is amplified.'
    elif operation=='integral':xx,yy=x,integrate.cumulative_trapezoid(y,x,initial=0);yu=str(unit(yu)*unit(xu));note='Cumulative trapezoidal integral with initial integral zero.'
    elif operation=='smooth':
        window=int(window)
        if window<3 or window%2==0 or window>len(y):raise ValueError('Choose an odd smoothing window from 3 to the sample count.')
        xx,yy=x,signal.savgol_filter(y,window,2);note='Savitzky–Golay smoothing, polynomial order two. Output points are correlated.'
    else:raise ValueError('Unknown signal operation.')
    peaks,_=signal.find_peaks(yy)
    return clean({'x':xx,'y':yy,'xunit':xu,'yunit':yu,'note':note+' Output measurement uncertainty is not estimated.','peaks':[{'x':xx[i],'y':yy[i]} for i in peaks[:50]]})
