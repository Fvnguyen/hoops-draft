'use client';

import { useEffect, useState, useMemo } from 'react';
import { PlayerCardData } from '@/components/PlayerCard';
import { ChevronDown, ChevronUp, Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

const rarityValue: Record<string, number> = {
  'Mythic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

export default function DatabasePage() {
  const [cards, setCards] = useState<PlayerCardData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sorting State
  const [sortField, setSortField] = useState<string>('overall');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  
  // Columns toggle
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    Team: true, Pos: true, Height: true, Weight: true,
    Rarity: true, OVR: true, 
    FIN: false, MID: false, PER: false, PLY: false, REB: false, DEF: false,
    PTS: true, TRB: true, AST: true, STL: true, BLK: true,
    'FG%': false, '3P%': false, 'FT%': false,
    MPG: false, GP: false,
    Traits: true,
  });
  
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  useEffect(() => {
    fetch('/api/cards')
      .then(res => res.json())
      .then(data => {
        setCards(data);
        setLoading(false);
      });
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortValue = (c: PlayerCardData, field: string) => {
    switch (field) {
      case 'name': return c.player.name;
      case 'team': return c.player.team;
      case 'rarity': return rarityValue[c.rarity] || 0;
      case 'overall': return c.ratings.overall;
      case 'fin': return c.ratings.finishing;
      case 'mid': return c.ratings.midRange;
      case 'per': return c.ratings.perimeter;
      case 'ply': return c.ratings.playmaking;
      case 'reb': return c.ratings.rebounding;
      case 'def': return Math.max(c.ratings.perimeterDefense, c.ratings.postDefense); // or avg
      case 'pts': return c.stats.pts;
      case 'trb': return c.stats.trb;
      case 'ast': return c.stats.ast;
      case 'stl': return c.stats.stl;
      case 'blk': return c.stats.blk;
      case 'fg%': return c.stats.fg_pct;
      case '3p%': return c.stats.fg3_pct;
      case 'ft%': return c.stats.ft_pct;
      case 'mpg': return c.stats.mpg;
      case 'gp': return c.stats.gp;
      case 'height': return parseFloat(c.player.height.replace('-', '.'));
      case 'weight': return c.player.weight;
      default: return 0;
    }
  };

  const filteredAndSortedCards = useMemo(() => {
    let result = cards;
    
    // Filter
    if (searchTerm) {
      result = result.filter(c => c.player.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (teamFilter !== 'ALL') {
      result = result.filter(c => c.player.team === teamFilter);
    }
    if (posFilter !== 'ALL') {
      result = result.filter(c => c.player.position.includes(posFilter));
    }
    if (rarityFilter !== 'ALL') {
      result = result.filter(c => c.rarity === rarityFilter);
    }
    
    // Sort
    result.sort((a, b) => {
      const valA = getSortValue(a, sortField);
      const valB = getSortValue(b, sortField);
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [cards, searchTerm, teamFilter, posFilter, rarityFilter, sortField, sortOrder]);

  const allTeams = Array.from(new Set(cards.map(c => c.player.team))).sort();
  const allPos = ['PG', 'SG', 'SF', 'PF', 'C'];
  const allRarities = ['Mythic', 'Rare', 'Uncommon', 'Common'];

  if (loading) return <div className="p-10 text-stone-400 font-semibold text-2xl">Loading Database...</div>;

  return (
    <div className="min-h-screen p-6 pt-[70px] text-stone-800">
      <div className="max-w-[1500px] mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input 
              type="text" 
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-stone-500 w-56"
            />
          </div>
          
          <select 
            value={teamFilter} 
            onChange={e => setTeamFilter(e.target.value)}
            className="px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none"
          >
            <option value="ALL">All Teams</option>
            {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          
          <select 
            value={posFilter} 
            onChange={e => setPosFilter(e.target.value)}
            className="px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none"
          >
            <option value="ALL">All Positions</option>
            {allPos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select 
            value={rarityFilter} 
            onChange={e => setRarityFilter(e.target.value)}
            className="px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none"
          >
            <option value="ALL">All Rarities</option>
            {allRarities.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          
          <div className="relative ml-auto">
            <button 
              onClick={() => setShowColumnsMenu(!showColumnsMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-stone-50 rounded-lg text-sm font-bold text-stone-600 border border-stone-700 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Columns
            </button>
            {showColumnsMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-stone-200 rounded-lg shadow-xl p-3 z-50 grid grid-cols-2 gap-2">
                {Object.keys(visibleColumns).map(col => (
                  <label key={col} className="flex items-center gap-2 hover:bg-stone-50 rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={visibleColumns[col]}
                      onChange={(e) => setVisibleColumns(prev => ({ ...prev, [col]: e.target.checked }))}
                      className="accent-orange-500 w-3 h-3"
                    />
                    <span className="text-[11px] font-bold uppercase">{col}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Table */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto shadow-sm">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-stone-50 text-stone-400 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('name')}>
                  Player {sortField === 'name' && <ArrowUpDown className="inline w-3 h-3 ml-1" />}
                </th>
                {visibleColumns['Team'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('team')}>Team</th>}
                {visibleColumns['Pos'] && <th className="px-3 py-3">Pos</th>}
                {visibleColumns['Height'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('height')}>Height</th>}
                {visibleColumns['Weight'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('weight')}>Weight</th>}
                
                {visibleColumns['Rarity'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('rarity')}>Rarity</th>}
                {visibleColumns['OVR'] && <th className="px-3 py-3 text-orange-400 cursor-pointer hover:text-orange-300" onClick={() => handleSort('overall')}>OVR</th>}
                
                {visibleColumns['FIN'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('fin')}>FIN</th>}
                {visibleColumns['MID'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('mid')}>MID</th>}
                {visibleColumns['PER'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('per')}>PER</th>}
                {visibleColumns['PLY'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('ply')}>PLY</th>}
                {visibleColumns['REB'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('reb')}>REB</th>}
                {visibleColumns['DEF'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('def')}>DEF</th>}

                {visibleColumns['PTS'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('pts')}>PTS</th>}
                {visibleColumns['TRB'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('trb')}>TRB</th>}
                {visibleColumns['AST'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('ast')}>AST</th>}
                {visibleColumns['STL'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('stl')}>STL</th>}
                {visibleColumns['BLK'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('blk')}>BLK</th>}
                {visibleColumns['FG%'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('fg%')}>FG%</th>}
                {visibleColumns['3P%'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('3p%')}>3P%</th>}
                {visibleColumns['FT%'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('ft%')}>FT%</th>}
                {visibleColumns['MPG'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('mpg')}>MPG</th>}
                {visibleColumns['GP'] && <th className="px-3 py-3 cursor-pointer hover:text-stone-800" onClick={() => handleSort('gp')}>GP</th>}
                {visibleColumns['Traits'] && <th className="px-3 py-3">Traits / Awards</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800 text-xs">
              {filteredAndSortedCards.map((c, idx) => {
                const isMythic = c.rarity === 'Mythic';
                const isRare = c.rarity === 'Rare';
                const isUncommon = c.rarity === 'Uncommon';

                return (
                  <tr key={c.id} className={`hover:bg-stone-800/50 transition-colors ${idx % 2 === 0 ? 'bg-stone-900' : 'bg-stone-900/40'}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-800 shrink-0 border border-stone-700">
                          <img src={`/headshots/${c.player.id}.png`} alt="" className="w-full h-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div className="font-bold">{c.player.name}</div>
                      </div>
                    </td>
                    {visibleColumns['Team'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.player.team}</td>}
                    {visibleColumns['Pos'] && <td className="px-3 py-2 text-stone-400 font-bold">{c.player.position}</td>}
                    {visibleColumns['Height'] && <td className="px-3 py-2 text-stone-400">{c.player.height}</td>}
                    {visibleColumns['Weight'] && <td className="px-3 py-2 text-stone-400">{c.player.weight}</td>}
                    
                    {visibleColumns['Rarity'] && (
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                          isMythic ? 'bg-orange-500/10 text-orange-600 border-orange-500/50' :
                          isRare ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/50' :
                          isUncommon ? 'bg-stone-300/20 text-stone-200 border-stone-300/50' :
                          'bg-stone-800 text-stone-400 border-stone-700'
                        }`}>
                          {c.rarity}
                        </span>
                      </td>
                    )}

                    {visibleColumns['OVR'] && (
                      <td className="px-3 py-2 font-black text-white">
                        <span className={`px-2 py-1 rounded bg-stone-950 border ${c.ratings.overall >= 90 ? 'border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]' : c.ratings.overall >= 80 ? 'border-yellow-500/50 text-yellow-400' : 'border-stone-700 text-stone-300'}`}>
                          {c.ratings.overall}
                        </span>
                      </td>
                    )}

                    {visibleColumns['FIN'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.ratings.finishing}</td>}
                    {visibleColumns['MID'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.ratings.midRange}</td>}
                    {visibleColumns['PER'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.ratings.perimeter}</td>}
                    {visibleColumns['PLY'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.ratings.playmaking}</td>}
                    {visibleColumns['REB'] && <td className="px-3 py-2 text-stone-300 font-medium">{c.ratings.rebounding}</td>}
                    {visibleColumns['DEF'] && <td className="px-3 py-2 text-stone-300 font-medium">{Math.max(c.ratings.perimeterDefense, c.ratings.postDefense)}</td>}

                    {visibleColumns['PTS'] && <td className="px-3 py-2 font-medium">{c.stats.pts.toFixed(1)}</td>}
                    {visibleColumns['TRB'] && <td className="px-3 py-2 font-medium">{c.stats.trb.toFixed(1)}</td>}
                    {visibleColumns['AST'] && <td className="px-3 py-2 font-medium">{c.stats.ast.toFixed(1)}</td>}
                    {visibleColumns['STL'] && <td className="px-3 py-2 font-medium">{c.stats.stl.toFixed(1)}</td>}
                    {visibleColumns['BLK'] && <td className="px-3 py-2 font-medium">{c.stats.blk.toFixed(1)}</td>}
                    
                    {visibleColumns['FG%'] && <td className="px-3 py-2 text-stone-400">{(c.stats.fg_pct * 100).toFixed(1)}</td>}
                    {visibleColumns['3P%'] && <td className="px-3 py-2 text-stone-400">{(c.stats.fg3_pct * 100).toFixed(1)}</td>}
                    {visibleColumns['FT%'] && <td className="px-3 py-2 text-stone-400">{(c.stats.ft_pct * 100).toFixed(1)}</td>}
                    {visibleColumns['MPG'] && <td className="px-3 py-2 text-stone-400">{c.stats.mpg.toFixed(1)}</td>}
                    {visibleColumns['GP'] && <td className="px-3 py-2 text-stone-400">{c.stats.gp}</td>}
                    
                    {visibleColumns['Traits'] && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 items-center max-w-xs">
                          {c.awards.map((aw, i) => (
                             <span key={i} className="px-1 py-0.5 text-[8px] font-black uppercase rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                               {aw}
                             </span>
                          ))}
                          {c.traits.map((t, i) => (
                            <span key={i} className="px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-stone-100 text-stone-600 border border-stone-700 flex gap-1">
                              <span className="text-stone-500">{t.level}x</span>{t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredAndSortedCards.length === 0 && (
            <div className="p-8 text-center text-stone-500 font-bold">No players found matching filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}
