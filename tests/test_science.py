import copy, math, unittest
import numpy as np
from better_exl.templates import col,blank_sheet,demo,from_template,TEMPLATES
from better_exl.engine import analyze,calculate,model_defaults,repeated,signal_analysis
from better_exl.expressions import Expression,Q

def dataset(x,y,ux=.1,uy=.2):
    s=blank_sheet(columns=[col('x','X','s',uncertainty=ux),col('y','Y','m',uncertainty=uy)])
    s['rows']=[dict(id=str(i),values=dict(x=a,y=b),uncertainties={},included=True,note='') for i,(a,b) in enumerate(zip(x,y))]
    return s

def line(method='wls'):
    s=dataset(np.arange(1,7).tolist(),[3.2,5.0,7.1,8.8,11.2,12.9]);s['fit']=model_defaults(s,'linear');s['fit'].update(enabled=True,method=method);return s

class Expressions(unittest.TestCase):
    def test_reject_code(self):
        for text in ['__import__("os")','x.__class__','x[0]','[1,2]','open(x)','x if y else 0','sum(x)','"hi"']:
            with self.subTest(text=text),self.assertRaises(ValueError):Expression(text)
    def test_units_and_degrees(self):
        self.assertAlmostEqual(Expression('sin(x)')({'x':Q(30,'degree')}).magnitude,.5)
        self.assertAlmostEqual(Expression('y = 2*x^2')({'x':Q(3,'m')}).to('m^2').magnitude,18)
    def test_incompatible_units(self):
        with self.assertRaises(Exception):Expression('x+y')({'x':Q(1,'m'),'y':Q(1,'s')})

class Uncertainty(unittest.TestCase):
    def test_analytic_acceleration(self):
        s=dataset([2],[4],ux=.1,uy=.2);s['columns'].append(col('a','Acceleration','m/s^2','2*y/x^2'));r=analyze(s)
        self.assertAlmostEqual(r['values']['a'][0],2)
        self.assertAlmostEqual(r['uncertainties']['a'][0],math.sqrt(.1**2+.2**2),places=7)
    def test_shared_source_cancellation(self):
        s=dataset([2],[4]);s['columns'] += [col('q','Q','s','2*x'),col('difference','Difference','s','q-2*x')];r=analyze(s)
        self.assertAlmostEqual(r['uncertainties']['difference'][0],0,places=8)
    def test_correlation(self):
        s=dataset([2],[4],ux=.1,uy=.2);s['columns'][1]['unit']='s';s['columns'].append(col('z','Sum','s','x+y'));s['correlations']=[dict(a='x',b='y',rho=.5)]
        self.assertAlmostEqual(analyze(s)['uncertainties']['z'][0],math.sqrt(.07),places=7)
        s['correlations'][0]['rho']=2
        with self.assertRaises(ValueError):analyze(s)
    def test_unit_conversion(self):
        s=dataset([200],[0],ux=2);s['columns'][0]['unit']='cm';s['columns'].append(col('metres','Metres','m','x'));r=analyze(s)
        self.assertAlmostEqual(r['values']['metres'][0],2);self.assertAlmostEqual(r['uncertainties']['metres'][0],.02,places=8)
    def test_missing_is_not_zero(self):
        s=dataset(['',0,'bad'],[1,2,3],ux='');s['columns'].append(col('double','Double','s','2*x'));r=analyze(s)
        self.assertEqual(r['values']['x'],[None,0,None]);self.assertEqual(r['uncertainties']['double'],[None,None,None]);self.assertTrue(any('nonnumeric' in x for x in r['diagnostics']))
    def test_resolution_and_override(self):
        s=dataset([1,2],[3,4],ux=.1);s['columns'][0]['uncertaintyMode']='resolution';s['rows'][1]['uncertainties']['x']=.4;r=analyze(s)
        self.assertAlmostEqual(r['uncertainties']['x'][0],.1/math.sqrt(12));self.assertEqual(r['uncertainties']['x'][1],.4)
    def test_cycle_is_diagnostic(self):
        s=dataset([1],[2]);s['columns'] += [col('aa','A','','bb'),col('bb','B','','aa')];r=analyze(s)
        self.assertIsNone(r['values']['aa'][0]);self.assertTrue(any('Circular' in x for x in r['diagnostics']))
    def test_linked_uncertainty(self):
        s=dataset([1,2],[3,4]);s['columns'].append(col('sigma_y','Sigma Y','cm'));s['columns'][1]['uncertaintyColumn']='sigma_y'
        for row in s['rows']:row['values']['sigma_y']=5
        np.testing.assert_allclose(analyze(s)['uncertainties']['y'],[.05,.05])
    def test_constants_uncertainty(self):
        s=dataset([1],[2],uy=0);s['constants']=[dict(key='scale',value=3,unit='',uncertainty=.1)];s['columns'].append(col('scaled','Scaled','m','scale*y'))
        self.assertAlmostEqual(analyze(s)['uncertainties']['scaled'][0],.2,places=8)

class Fitting(unittest.TestCase):
    def test_wls_matches_closed_form(self):
        s=line();r=analyze(s)['fit'];x=np.arange(1,7);X=np.column_stack([x,np.ones(6)]);cov=np.linalg.inv(X.T@X/.04);beta=cov@X.T@np.array([3.2,5,7.1,8.8,11.2,12.9])/.04
        np.testing.assert_allclose([p['value'] for p in r['params']],beta,rtol=1e-6);np.testing.assert_allclose(r['covariance'],cov,rtol=1e-6);self.assertEqual(r['dof'],4)
    def test_wls_requires_sigma(self):
        s=line();s['rows'][0]['uncertainties']['y']=0;r=analyze(s);self.assertIsNone(r['fit']);self.assertIn('positive',r['fitError'])
    def test_ols_has_no_chi_squared(self):
        r=analyze(line('ols'))['fit'];self.assertIsNone(r['chi2']);self.assertIsNotNone(r['params'][0]['stderr'])
    def test_theory_is_independent(self):
        s=line();s['theory']=dict(enabled=True,expression='k*x',params=[dict(name='k',value=2,unit='m/s')]);r=analyze(s)
        self.assertEqual(r['theory']['predicted'],[2,4,6,8,10,12]);self.assertNotEqual(r['fit']['predicted'],r['theory']['predicted'])
        s['theory']['params'][0]['value']=0;self.assertEqual(analyze(s)['theory']['percentDeviation'],[None]*6)
    def test_nonlinear_with_fixed_baseline(self):
        x=np.linspace(0,6,25);s=dataset(x.tolist(),(4*np.exp(-x/1.5)+.5).tolist());s['fit']=model_defaults(s,'decay');s['fit'].update(enabled=True,method='wls');s['fit']['params'][2].update(value=.5,fixed=True);r=analyze(s)
        self.assertNotIn('fitError',r);self.assertAlmostEqual(r['fit']['params'][1]['value'],1.5,places=5);self.assertIsNone(r['fit']['params'][2]['stderr'])
    def test_odr_bounds_and_result(self):
        s=line('odr');r=analyze(s);self.assertNotIn('fitError',r);self.assertAlmostEqual(r['fit']['params'][0]['value'],2,delta=.05)
        s['fit']['params'][0]['lower']=0;self.assertIn('bounds',analyze(s)['fitError'])
    def test_exclusion_and_identifiability(self):
        s=line();s['rows'][0]['included']=False;self.assertEqual(analyze(s)['fit']['n'],5)
        for row in s['rows']:row['values']['x']=1
        self.assertIn('all equal',analyze(s)['fitError'])
    def test_bad_theory_units(self):
        s=line();s['theory']=dict(enabled=True,expression='x',params=[]);r=analyze(s);self.assertIsNone(r['theory']);self.assertIn('convert',r['theoryError'])

class LabTools(unittest.TestCase):
    def test_repeated_trials(self):
        s=dataset([1,1,1,2],[2,4,6,8]);r=repeated(s,'x','y',.5);g=r['rows'][0];self.assertEqual(g['mean'],4);self.assertEqual(g['sd'],2);self.assertAlmostEqual(g['combined'],math.sqrt(4/3+.25));self.assertIsNone(r['rows'][1]['sem'])
    def test_fft(self):
        x=np.arange(128)/128;s=dataset(x.tolist(),(3*np.sin(2*np.pi*8*x)).tolist());r=signal_analysis(s,'fft');i=np.argmax(r['y']);self.assertEqual(r['x'][i],8);self.assertAlmostEqual(r['y'][i],3)
        s['rows'][5]['values']['x']+=.001
        with self.assertRaises(ValueError):signal_analysis(s,'fft')
    def test_templates_have_valid_defaults(self):
        self.assertEqual(len(TEMPLATES),25)
        for t in TEMPLATES:
            with self.subTest(template=t['id']):s=from_template(t['id']);analyze(s);model_defaults(s,t['model']);self.assertEqual(s['rows'],[])
    def test_demo(self):
        r=analyze(demo()['sheets'][0]);self.assertNotIn('fitError',r);self.assertNotIn('theoryError',r);self.assertAlmostEqual(r['fit']['params'][0]['value'],4.038433624,places=5)
    def test_contour(self):
        s=from_template('equipotential');s['rows']=[dict(values=dict(pos_x=x,pos_y=y,potential=x+y),uncertainties={}) for x,y in [(0,0),(0,1),(1,0),(1,1)]];r=analyze(s);self.assertEqual(len(r['map']['z']),70);self.assertAlmostEqual(r['map']['z'][35][35],70/69)
    def test_derivative_and_integral(self):
        x=np.linspace(0,2,21);s=dataset(x.tolist(),(x*x).tolist());r=signal_analysis(s,'derivative');np.testing.assert_allclose(r['y'],2*x,atol=1e-12);self.assertAlmostEqual(signal_analysis(s,'integral')['y'][-1],8/3,delta=.005)

if __name__=='__main__':unittest.main()
