

lines = []
lines.append('county,lonmin,latmin,lonmax,latmax\n')
with open('county_bounding_boxes.txt', 'r') as f:
	for line in f:
		begin = [x.strip() for x in line.split('\t')]
		
		
		imp_values = []
		for i in [2, 4, 5, 6, 7]:
			if i != 7:
				imp_values.append(begin[i] + ',')
			else:
				imp_values.append(begin[i])
		
		imp_values.append('\n')
		lines.append(''.join(imp_values))

with open('county_bounds.csv', 'w') as f:
	for line in lines:
		f.write(line)