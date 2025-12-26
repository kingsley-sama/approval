def un_ordered(array):
    result = []
    hash_map = {}
    for i, val in enumerate(array):
        hash_map[val] = val
    print(hash_map)
    print(hash_map.keys())
    for i in range(len(array)):
        if hash_map[i]:
            result = hash_map[i]
        else:
            result = '_'
    return result 

print(un_ordered([1,1,1,1,2,2,2,4,5,6,7,8]))