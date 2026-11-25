function GameManager(t,i,n){this.size=t,this.inputManager=new i,this.actuator=new n,this.running=!1,this.inputManager.on("move",this.move.bind(this)),this.inputManager.on("restart",this.restart.bind(this)),this.inputManager.on("think",function(){var t=this.ai.getBest();this.actuator.showHint(t.move)}.bind(this)),this.inputManager.on("run",function(){this.running?(this.running=!1,this.actuator.setRunButton("Auto-run")):(this.running=!0,this.run(),this.actuator.setRunButton("Stop"))}.bind(this)),this.setup()}GameManager.prototype.restart=function(){this.actuator.restart(),this.running=!1,this.actuator.setRunButton("Auto-run"),this.setup()},GameManager.prototype.setup=function(){this.grid=new Grid(this.size);if(!GameManager.restore(this)){this.grid.addStartTiles(),this.score=0,this.over=!1,this.won=!1}this.ai=new AI(this.grid),this.actuate()},GameManager.prototype.actuate=function(){this.actuator.actuate(this.grid,{score:this.score,over:this.over,won:this.won})},GameManager.prototype.move=function(t){var i=this.grid.move(t);this.score+=i.score,i.won?this.won=!0:i.moved&&this.grid.computerMove(),this.grid.movesAvailable()||(this.over=!0),this.actuate(),GameManager.persist(this)},GameManager.prototype.run=function(){var t=this.ai.getBest();this.move(t.move);var i=animationDelay;if(this.running&&!this.over&&!this.won){var n=this;setTimeout((function(){n.run()}),i)}};

/* ---- save support (GG-LOUNGE) --------------------------------------------
 * The upstream build kept only an in-memory score, so closing the tab lost an
 * in-progress board. persist() snapshots the grid cells plus score/win flags
 * after every move; restore() rebuilds them on load. GGSave is the shared
 * storage helper on this site and falls back to cookies when localStorage is
 * unavailable, but every call is guarded so the game still runs without it. */
GameManager.KEY='ggl2048';
GameManager.persist=function(g){
  try{
    if(!window.GGSave||!g||!g.grid)return;
    var cells=[];
    for(var x=0;x<g.grid.size;x++)for(var y=0;y<g.grid.size;y++){
      var c=g.grid.cells[x][y];
      cells.push(c?c.value:0);
    }
    window.GGSave.set(GameManager.KEY,{cells:cells,size:g.grid.size,score:g.score,over:g.over,won:g.won,ts:Date.now()});
  }catch(e){}
};
GameManager.restore=function(g){
  try{
    if(!window.GGSave)return false;
    var d=window.GGSave.get(GameManager.KEY,null);
    if(!d||!d.cells||d.size!==g.grid.size)return false;
    // A finished game is not worth resuming; start fresh instead.
    if(d.over)return false;
    for(var x=0;x<g.grid.size;x++)for(var y=0;y<g.grid.size;y++){
      var v=d.cells[x*g.grid.size+y];
      g.grid.cells[x][y]=v?new Tile({x:x,y:y},v):null;
    }
    g.score=d.score||0;g.won=!!d.won;g.over=!!d.over;
    return true;
  }catch(e){return false}
};
