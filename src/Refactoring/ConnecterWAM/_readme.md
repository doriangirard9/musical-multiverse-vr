### EXPLICATION 

On avait un soucis pour gérer les connexions MIDI et AUDIO sur nos wams. Code dupliqué pour faire un connect() ou un connectEvents()
Le pattern Strategy m'a semblé le plus adapté pour gérer les connexions. On abstrait les logiques dans des strategies et on utilise uniquement 
les méthodes connect() ou disconnect(). La stratégie cherche automatiquement la méthode a utiliser en fonction de la src et dst.
