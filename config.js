// Moppenboek Troy & Kjelt – instellingen (geen geheimen hier: deze file is publiek).
// De Gemini-sleutel staat in het tabblad Config van de Sheet,
// zodat alleen Troy en Kjelt (ingelogd met Google) ze kunnen lezen.
window.MOP_CONFIG = {
  // GitHub Pages-projectsite (pad is hoofdlettergevoelig).
  BASE_PATH: '/Troy-Kjelt-app/',
  // Moet exact zo in de Google Web-client staan (implicit redirect).
  REDIRECT_URI: 'https://troymwoan.github.io/Troy-Kjelt-app/',
  // Google Web-client (project "ZONERO app"). Origin + redirect-URI van de host moeten erin staan.
  GOOGLE_CLIENT_ID: '903416223998-li4dobc2kv8ms2ktmsdp66mfr363e6h6.apps.googleusercontent.com',
  // Sheet "Moppenboek Troy & Kjelt – App data" (account troygodijn@gmail.com)
  SHEET_ID: '1IqyVecs-wcRSj2IrYXVtKvyleJzEqSwbsIopw0CLprw',
  // Wie is wie (het tabblad Config in de Sheet mag dit aanvullen)
  TROY_EMAILS: ['troygodijn@gmail.com', 'zoneromedia@gmail.com'],
  KJELT_EMAILS: ['kjelt.framerush@gmail.com'],
};
