"""Restricted arithmetic interpreter and physical units; never eval user text."""
import ast
import operator
import re
import numpy as np
import pint
from scipy import constants as sc

ureg=pint.UnitRegistry(autoconvert_offset_to_baseunit=True)
Q=ureg.Quantity
FUNCTIONS={n:getattr(np,n) for n in ('sin','cos','tan','arcsin','arccos','arctan','sinh','cosh','tanh','exp','log','log10','sqrt','abs')}
FUNCTIONS['ln']=np.log
CONSTANTS={'pi':(np.pi,'',0),'c':(sc.c,'m/s',0),'h':(sc.h,'J*s',0),'hbar':(sc.hbar,'J*s',0),'e_charge':(sc.e,'C',0),'k_B':(sc.k,'J/K',0),'N_A':(sc.N_A,'1/mol',0),'g0':(sc.g,'m/s^2',0)}
for name,key,un in [('G','Newtonian constant of gravitation','m^3/kg/s^2'),('epsilon_0','vacuum electric permittivity','F/m'),('mu_0','vacuum mag. permeability','N/A^2'),('m_e','electron mass','kg'),('m_p','proton mass','kg')]:
    v,_,u=sc.physical_constants[key];CONSTANTS[name]=(v,un,u)

def symbol_ok(name):return isinstance(name,str) and bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,39}',name)) and name not in FUNCTIONS
def unit(text):
    if not isinstance(text,str) or len(text)>100:raise ValueError('Use a unit such as m, s, V or m/s^2.')
    return ureg.Unit(text.strip() or 'dimensionless')

class Expression:
    def __init__(self,source):
        if not isinstance(source,str) or not source.strip() or len(source)>500:raise ValueError('Enter an equation of 1–500 characters.')
        source=source.strip().lstrip('=')
        if '=' in source:
            lhs,source=source.split('=',1)
            if not symbol_ok(lhs.strip()):raise ValueError('The equation left side must be one symbol.')
        self.source=source.strip().replace('^','**').replace('π','pi')
        try:self.tree=ast.parse(self.source,mode='eval').body
        except (SyntaxError,RecursionError) as e:raise ValueError('Check equation syntax. Use * to multiply and ^ for powers.') from e
        nodes=list(ast.walk(self.tree))
        if len(nodes)>120:raise ValueError('Split this expression into simpler calculated columns.')
        for n in nodes:
            if not isinstance(n,(ast.BinOp,ast.UnaryOp,ast.Call,ast.Name,ast.Constant,ast.Load,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Pow,ast.UAdd,ast.USub)):raise ValueError('Only arithmetic, symbols and listed mathematical functions are allowed.')
            if isinstance(n,ast.Constant) and (type(n.value) not in (int,float) or abs(n.value)>1e100):raise ValueError('Only finite numeric constants are allowed.')
            if isinstance(n,ast.Name) and not symbol_ok(n.id) and n.id not in FUNCTIONS:raise ValueError('Invalid symbol.')
            if isinstance(n,ast.Call) and (not isinstance(n.func,ast.Name) or n.func.id not in FUNCTIONS or len(n.args)!=1 or n.keywords):raise ValueError('Use a listed single-argument function such as sqrt(x).')
        self.names={n.id for n in nodes if isinstance(n,ast.Name)}-set(FUNCTIONS)
    def __call__(self,scope):
        def visit(n):
            if isinstance(n,ast.Constant):return float(n.value)
            if isinstance(n,ast.Name):
                if n.id not in scope:raise ValueError(f"Unknown symbol '{n.id}'. Add a column or constant with that symbol.")
                return scope[n.id]
            if isinstance(n,ast.Call):return FUNCTIONS[n.func.id](visit(n.args[0]))
            if isinstance(n,ast.UnaryOp):return -visit(n.operand) if isinstance(n.op,ast.USub) else visit(n.operand)
            a,b=visit(n.left),visit(n.right)
            if isinstance(n.op,ast.Pow):
                b=b.to('').magnitude if isinstance(b,Q) else b
                if np.any(np.abs(b)>100):raise ValueError('Power magnitude must not exceed 100.')
                return a**b
            return {ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv}[type(n.op)](a,b)
        with np.errstate(all='ignore'):return visit(self.tree)

def magnitude(value,target=None):
    q=value if isinstance(value,Q) else Q(value,'')
    return np.asarray(q.to(target).magnitude if target is not None else q.magnitude,dtype=float)
def array(value,n):return np.broadcast_to(np.asarray(value,dtype=float),(n,)).copy()
def derivative(fn,v,scale=0):
    v=np.asarray(v,dtype=float);step=np.cbrt(np.finfo(float).eps)*np.maximum(np.abs(v),np.abs(scale));step=np.where(step>0,step,np.cbrt(np.finfo(float).eps))
    return (fn(v+step)-fn(v-step))/(2*step)
def clean(v):
    if isinstance(v,dict):return {str(k):clean(x) for k,x in v.items()}
    if isinstance(v,(list,tuple,np.ndarray)):return [clean(x) for x in v]
    if isinstance(v,np.integer):return int(v)
    if isinstance(v,(float,np.floating)):return float(v) if np.isfinite(v) else None
    if isinstance(v,np.bool_):return bool(v)
    return v
