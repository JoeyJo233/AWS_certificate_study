const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = {window:{}};
vm.createContext(context);
for (const file of ['content.js','labs.js','quiz.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
new vm.Script(fs.readFileSync(path.join(root,'app.js'),'utf8'));
const {REVIEW_DATA:data,REVIEW_LABS:labs,REVIEW_QUIZ:quiz}=context.window;
const services=new Set(data.services.map(s=>s.id));
assert.equal(services.size,data.services.length,'service IDs must be unique');
const chapters=new Set(data.chapters.map(c=>c.id));
function checkGraph(graph,state,label){
  const ids=new Set(graph.nodes.map(n=>n.id));
  assert.equal(ids.size,graph.nodes.length,label+' duplicate node');
  const occupied=new Set();
  for(const node of graph.nodes){
    const position=node.col+':'+node.row;
    assert(!occupied.has(position),label+' overlapping node positions');occupied.add(position);
    if(node.service)assert(services.has(node.service),label+' missing service '+node.service);
  }
  for(const edge of graph.edges)assert(ids.has(edge.from)&&ids.has(edge.to),label+' missing edge endpoint');
  for(const id of [...(state.activeNodes||[]),...(state.failedNodes||[])])assert(ids.has(id),label+' unknown state node '+id);
  for(const edge of state.highlightEdges||[])assert(graph.edges.some(e=>e.from+'>'+e.to===edge),label+' missing highlighted edge '+edge);
}
for(const chapter of data.chapters){
  assert(chapter.steps.length>0);
  for(const id of chapter.services)assert(services.has(id),'missing service '+id);
  for(const step of chapter.steps)checkGraph(step.diagram||chapter.diagram,step,chapter.id+':'+step.title);
}
for(const lab of labs)for(const state of lab.states)checkGraph(lab.diagram,state,lab.id+':'+state.id);
assert.equal(new Set(quiz.map(q=>q.id)).size,quiz.length,'quiz IDs must be unique');
for(const q of quiz){
  assert.equal(q.options.length,4,q.id+' must have four choices');
  assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,q.id+' invalid answer');
  assert.equal(q.whyNot.length,4,q.id+' missing option explanations');
  assert(chapters.has(q.chapter),q.id+' missing related chapter');
  assert(q.explanation.length>10,q.id+' missing explanation');
}
console.log('Validated '+data.chapters.length+' chapters, '+data.services.length+' services, '+labs.length+' labs, '+quiz.length+' questions.');
