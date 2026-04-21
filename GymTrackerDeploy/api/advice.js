module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return res.status(500).json({ error: 'Chiave API Groq non configurata sul server.' });
  }

  const { analysisType = 'post_workout', history, currentPlan, sessionChanges } = req.body;

  let prompt = '';

  if (analysisType === 'post_workout') {
    if (!history || history.length === 0) {
      return res.status(400).json({ error: 'Dati allenamento mancanti.' });
    }
    const lastSession = history[0];
    prompt = `Sei un esperto personal trainer hardcore. Analizza l'ultima sessione di allenamento e dai 3-4 consigli mirati e motivazionali. Tono professionale, diretto e incoraggiante. Rispondi in italiano.

Ultima sessione (${new Date(lastSession.date).toLocaleDateString('it-IT')}):
- Giorno: ${lastSession.dayName}
- Esercizi: ${(lastSession.exercises || []).map(e => `${e.nome}: ${e.serie}x${e.ripetizioni} a ${e.peso}kg`).join(', ')}

Cronologia recente:
${JSON.stringify(history.slice(0, 5).map(h => ({ data: new Date(h.date).toLocaleDateString('it-IT'), giorno: h.dayName, esercizi: h.exercises?.length })), null, 2)}`;

  } else if (analysisType === 'modified_workout') {
    if (!sessionChanges || sessionChanges.length === 0) {
      return res.status(400).json({ error: 'Dati modifiche mancanti.' });
    }
    const lastSession = history?.[0];
    prompt = `Sei un esperto personal trainer. Durante la sessione l'atleta ha modificato alcuni parametri. Analizza le modifiche, commenta se sono state scelte sagge e dai 2-3 consigli per la prossima sessione. Tono professionale e diretto. Rispondi in italiano.

Sessione: ${lastSession?.dayName || 'Allenamento'}
Modifiche rilevate:
${sessionChanges.map(c => `- ${c.nome}: ${Object.entries(c.changes).map(([k, v]) => `${k} da ${v.before} a ${v.after}`).join(', ')}`).join('\n')}

Esercizi completati:
${(lastSession?.exercises || []).map(e => `${e.nome}: ${e.serie}x${e.ripetizioni} a ${e.peso}kg`).join(', ')}`;

  } else if (analysisType === 'rest_day') {
    prompt = `Sei un esperto personal trainer e coach del benessere. Oggi l'atleta si prende un giorno di riposo. Basandoti sulla sua cronologia, dai consigli su: recupero attivo, stretching, alimentazione e motivazione. Max 4 punti. Tono energico ma calmo. Rispondi in italiano.

Cronologia allenamenti recenti:
${JSON.stringify((history || []).slice(0, 7).map(h => ({ data: new Date(h.date).toLocaleDateString('it-IT'), giorno: h.dayName, esercizi: h.exercises?.length, serie_totali: h.exercises?.reduce((a, e) => a + (parseInt(e.serie) || 0), 0) })), null, 2)}`;

  } else if (analysisType === 'plan_review') {
    if (!currentPlan) {
      return res.status(400).json({ error: 'Piano di allenamento mancante.' });
    }
    prompt = `Sei un esperto personal trainer certificato. Analizza il piano di allenamento e la cronologia. Fornisci:
1. Una valutazione critica del piano (punti di forza e lacune)
2. 2-3 esercizi specifici da aggiungere o sostituire (con motivazione)
3. Consigli sulla struttura settimanale (volume, frequenza, recupero)
Max 5 punti totali. Sii specifico. Rispondi in italiano.

Piano attuale:
${currentPlan.giorni.map(g => `- ${g.nome}: ${g.esercizi.map(e => `${e.nome} (${e.serie}x${e.ripetizioni}, ${e.peso}kg)`).join(', ')}`).join('\n')}

Cronologia (ultime 10 sessioni):
${JSON.stringify((history || []).slice(0, 10).map(h => ({ data: new Date(h.date).toLocaleDateString('it-IT'), giorno: h.dayName, modificato: h.hadModifications })), null, 2)}`;

  } else {
    return res.status(400).json({ error: 'Tipo di analisi non valido.' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.72,
        max_tokens: 600,
      }),
    });

    if (!groqRes.ok) {
      const errorData = await groqRes.text();
      console.error('Groq API error:', errorData);
      return res.status(groqRes.status).json({ error: 'Errore dalla API di Groq.' });
    }

    const data = await groqRes.json();
    const advice = data.choices?.[0]?.message?.content || 'Nessun consiglio disponibile al momento.';

    return res.status(200).json({ advice });
  } catch (e) {
    console.error('Errore interno:', e);
    return res.status(500).json({ error: 'Errore durante la connessione a Groq.' });
  }
};
